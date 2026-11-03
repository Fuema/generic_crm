import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { haveIBeenPwned, organization, twoFactor } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, asc, desc, eq } from "drizzle-orm";
import { applyTemplateToNewWorkspace } from "#/modules/templates/templates.server";
import { db } from "../db/index"; // Points to your Neon-HTTP database file (not the legacy src/db.ts)
import * as schema from "../db/schema";
import {
	APP_NAME,
	sendInvitationEmail,
	sendResetPasswordEmail,
	sendTwoFactorCodeEmail,
	sendVerificationEmail,
} from "./email";
import { ac, roles } from "./permissions";
import {
	nameSchema,
	passwordContainsPersonalInfo,
	passwordSchema,
} from "./schema";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function slugify(value: string) {
	const base = value
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
	return `${base || "workspace"}-${crypto.randomUUID().slice(0, 6)}`;
}

// The workspace the user had open most recently, if they are still a member of it
async function lastUsedWorkspace(userId: string) {
	const [last] = await db
		.select({ organizationId: schema.member.organizationId })
		.from(schema.session)
		.innerJoin(
			schema.member,
			and(
				eq(schema.member.organizationId, schema.session.activeOrganizationId),
				eq(schema.member.userId, userId),
			),
		)
		.where(eq(schema.session.userId, userId))
		.orderBy(desc(schema.session.updatedAt))
		.limit(1);
	return last?.organizationId ?? null;
}

// Returns the user's first workspace, creating a personal one (with the user as
// owner) if they don't belong to any yet. Runs whenever a session is created, so
// it also covers accounts that existed before workspaces were introduced.
export async function ensureWorkspace(userId: string) {
	const [membership] = await db
		.select({ organizationId: schema.member.organizationId })
		.from(schema.member)
		.where(eq(schema.member.userId, userId))
		.orderBy(asc(schema.member.createdAt))
		.limit(1);
	if (membership) return membership.organizationId;

	const [owner] = await db
		.select({ name: schema.user.name })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.limit(1);
	const name = `${owner?.name ?? "My"}'s workspace`;
	const organizationId = crypto.randomUUID();
	const now = new Date();
	// neon-http has no interactive transactions; batch runs both inserts atomically
	await db.batch([
		db.insert(schema.organization).values({
			id: organizationId,
			name,
			slug: slugify(name),
			createdAt: now,
		}),
		db.insert(schema.member).values({
			id: crypto.randomUUID(),
			organizationId,
			userId,
			role: "owner",
			createdAt: now,
		}),
	]);
	// New workspaces start with the Generic template (spec §7.5)
	await applyTemplateToNewWorkspace(organizationId, userId);
	return organizationId;
}

// Only offer a social provider when its credentials are configured
const socialProviders = {
	...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
		? {
				google: {
					clientId: process.env.GOOGLE_CLIENT_ID,
					clientSecret: process.env.GOOGLE_CLIENT_SECRET,
					prompt: "select_account" as const,
				},
			}
		: {}),
	...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
		? {
				github: {
					clientId: process.env.GITHUB_CLIENT_ID,
					clientSecret: process.env.GITHUB_CLIENT_SECRET,
				},
			}
		: {}),
};

function rejectInvalid(result: {
	success: boolean;
	error?: { issues: { message: string }[] };
}) {
	if (!result.success) {
		throw new APIError("BAD_REQUEST", {
			message: result.error?.issues[0]?.message ?? "Invalid input",
		});
	}
}

export const auth = betterAuth({
	appName: APP_NAME,
	baseURL,
	trustedOrigins: [baseURL],
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification,
			twoFactor: schema.twoFactor,
			passkey: schema.passkey,
			rateLimit: schema.rateLimit,
			organization: schema.organization,
			member: schema.member,
			invitation: schema.invitation,
		},
	}),
	databaseHooks: {
		session: {
			create: {
				// Every new session starts in a workspace, so permission checks always
				// have an active organization: the last one used, or the first one
				before: async (session) => {
					const activeOrganizationId =
						(await lastUsedWorkspace(session.userId)) ??
						(await ensureWorkspace(session.userId));
					return { data: { ...session, activeOrganizationId } };
				},
			},
		},
	},
	emailAndPassword: {
		enabled: true, // Enables standard registration & login flows natively
		requireEmailVerification: true,
		minPasswordLength: 12,
		maxPasswordLength: 128,
		resetPasswordTokenExpiresIn: 60 * 60,
		// Invalidate every session when a password is reset
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user, url }) => {
			await sendResetPasswordEmail(user.email, user.name, url);
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		// Resend the link when an unverified user tries to sign in
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		expiresIn: 60 * 60,
		sendVerificationEmail: async ({ user, url }) => {
			await sendVerificationEmail(user.email, user.name, url);
		},
	},
	socialProviders,
	account: {
		accountLinking: {
			enabled: true,
			// Google and GitHub verify email ownership, so linking by email is safe
			trustedProviders: ["google", "github"],
		},
	},
	session: {
		// Rolling session: 7 days, extended at most once a day while the user is active.
		// No cookie cache, so a revoked session stops working immediately.
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		// Sensitive actions (2FA changes, passkeys, password) need a sign-in from the last 15 minutes
		freshAge: 60 * 15,
	},
	rateLimit: {
		enabled: true,
		storage: "database",
		window: 60,
		max: 100,
		customRules: {
			"/sign-in/*": { window: 60, max: 5 },
			"/sign-up/email": { window: 60 * 10, max: 3 },
			"/request-password-reset": { window: 60 * 10, max: 3 },
			"/reset-password": { window: 60 * 10, max: 5 },
			"/send-verification-email": { window: 60 * 10, max: 3 },
			"/change-password": { window: 60 * 10, max: 5 },
			"/two-factor/*": { window: 60, max: 5 },
			"/passkey/*": { window: 60, max: 10 },
			"/organization/invite-member": { window: 60 * 10, max: 10 },
			"/organization/create": { window: 60 * 10, max: 5 },
			"/get-session": false,
		},
	},
	advanced: {
		ipAddress: {
			// Cloudflare puts the real client IP here; used for rate limiting and session records
			ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
		},
	},
	hooks: {
		// Server-side copy of the form rules, so they can't be bypassed by calling the API directly
		before: createAuthMiddleware(async (ctx) => {
			const body = (ctx.body ?? {}) as Record<string, unknown>;
			if (ctx.path === "/sign-up/email") {
				rejectInvalid(nameSchema.safeParse(body.name));
				rejectInvalid(passwordSchema.safeParse(body.password));
				if (
					passwordContainsPersonalInfo(
						String(body.password ?? ""),
						String(body.email ?? ""),
						String(body.name ?? ""),
					)
				) {
					throw new APIError("BAD_REQUEST", {
						message: "Password can't contain your name or email",
					});
				}
			}
			if (ctx.path === "/reset-password" || ctx.path === "/change-password") {
				rejectInvalid(passwordSchema.safeParse(body.newPassword));
			}
		}),
	},
	plugins: [
		twoFactor({
			issuer: APP_NAME,
			otpOptions: {
				period: 3,
				allowedAttempts: 5,
				storeOTP: "hashed",
				sendOTP: async ({ user, otp }) => {
					await sendTwoFactorCodeEmail(user.email, user.name, otp);
				},
			},
			backupCodeOptions: { storeBackupCodes: "encrypted" },
		}),
		passkey({
			rpID: new URL(baseURL).hostname,
			rpName: APP_NAME,
			origin: baseURL,
		}),
		// Rejects passwords found in known data breaches (k-anonymity: only a hash prefix is sent)
		haveIBeenPwned({
			customPasswordCompromisedMessage:
				"This password appeared in a data breach. Please choose a different one.",
		}),
		organization({
			ac,
			roles,
			creatorRole: "owner",
			// Workspaces created from "New workspace" start with the Generic template
			organizationHooks: {
				afterCreateOrganization: async ({ organization, user }) => {
					await applyTemplateToNewWorkspace(organization.id, user.id);
				},
			},
			organizationLimit: 10,
			membershipLimit: 100,
			invitationLimit: 50,
			invitationExpiresIn: 60 * 60 * 48,
			cancelPendingInvitationsOnReInvite: true,
			// Only the verified owner of the invited address can accept
			requireEmailVerificationOnInvitation: true,
			sendInvitationEmail: async ({
				id,
				email,
				role,
				organization,
				inviter,
			}) => {
				await sendInvitationEmail(
					email,
					inviter.user.name,
					organization.name,
					role,
					`${baseURL}/accept-invitation/${id}`,
				);
			},
		}),
		tanstackStartCookies(), // Must stay last: sets session cookies from TanStack Start server functions
	],
});

export type Session = typeof auth.$Infer.Session;
