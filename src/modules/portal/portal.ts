import { createServerFn } from "@tanstack/react-start";
import {
	deleteCookie,
	getCookie,
	getRequestHeader,
	getRequestIP,
	setCookie,
} from "@tanstack/react-start/server";
import { requirePermission } from "#/lib/authz";
import { m } from "#/paraglide/messages.js";
import * as data from "./portal.server";
import {
	companyAccessSchema,
	contactPortalSchema,
	portalCookieName,
	portalSlugSchema,
	requestLinkSchema,
	signInSchema,
	updatePortalProfileSchema,
} from "./schema";

// Server functions for the customer portal (spec §8).
// - Staff functions manage a contact's access: requirePermission on contacts
//   (editors and up change it), workspace from the session as everywhere.
// - Portal functions take only the portal's slug: who is asking comes from
//   the portal session cookie, never from input, and every query is limited
//   to that contact's scope (spec §12.1). They never accept a staff session.

const member = (userId: string) => ({ type: "member" as const, id: userId });

// Links in emails point at the configured app address, never at a Host header
function appUrl() {
	return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

function clientIp() {
	return getRequestHeader("cf-connecting-ip") ?? getRequestIP() ?? null;
}

async function requirePortal(slug: string) {
	const scope = await data.resolvePortalSession(
		slug,
		getCookie(portalCookieName(slug)),
	);
	if (!scope) throw new Response(m.error_portal_signed_out(), { status: 401 });
	return scope;
}

// --- Staff ------------------------------------------------------------------

export const getContactPortal = createServerFn({ method: "GET" })
	.middleware([requirePermission({ contact: ["read"] })])
	.validator(contactPortalSchema)
	.handler(async ({ data: { contactId }, context }) => {
		const access = await data.getPortalAccess(context.workspaceId, contactId);
		return {
			access,
			sessions: access
				? await data.activeSessions(context.workspaceId, contactId)
				: 0,
		};
	});

export const inviteToPortal = createServerFn({ method: "POST" })
	.middleware([requirePermission({ contact: ["update"] })])
	.validator(contactPortalSchema)
	.handler(({ data: { contactId }, context }) =>
		data.inviteContact(
			context.workspaceId,
			member(context.session.user.id),
			contactId,
			appUrl(),
		),
	);

export const revokePortal = createServerFn({ method: "POST" })
	.middleware([requirePermission({ contact: ["update"] })])
	.validator(contactPortalSchema)
	.handler(({ data: { contactId }, context }) =>
		data.revokePortalAccess(
			context.workspaceId,
			member(context.session.user.id),
			contactId,
		),
	);

export const setPortalCompanyAccess = createServerFn({ method: "POST" })
	.middleware([requirePermission({ contact: ["update"] })])
	.validator(companyAccessSchema)
	.handler(({ data: { contactId, companyAccess }, context }) =>
		data.setCompanyAccess(
			context.workspaceId,
			member(context.session.user.id),
			contactId,
			companyAccess,
		),
	);

// --- Portal -----------------------------------------------------------------

// The sign-in page: the workspace's name, and whether this browser is in
export const getPortalEntry = createServerFn({ method: "GET" })
	.validator(portalSlugSchema)
	.handler(async ({ data: { slug } }) => {
		const workspace = await data.workspaceBySlug(slug);
		if (!workspace)
			throw new Response(m.error_portal_not_found(), { status: 404 });
		const scope = await data.resolvePortalSession(
			slug,
			getCookie(portalCookieName(slug)),
		);
		return { workspaceName: workspace.name, signedIn: scope !== null };
	});

export const requestPortalLink = createServerFn({ method: "POST" })
	.validator(requestLinkSchema)
	.handler(({ data: { slug, email } }) =>
		data.requestLink(slug, email, clientIp(), appUrl()),
	);

export const portalSignIn = createServerFn({ method: "POST" })
	.validator(signInSchema)
	.handler(async ({ data: { slug, token } }) => {
		const previous = getCookie(portalCookieName(slug));
		const { session, expiresAt } = await data.signIn(slug, token, {
			ip: clientIp(),
			userAgent: getRequestHeader("user-agent") ?? null,
		});
		// The session this browser had before ends: one at a time per portal
		if (previous) await data.signOut(previous);
		setCookie(portalCookieName(slug), session, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			expires: expiresAt,
		});
		return { ok: true };
	});

export const portalSignOut = createServerFn({ method: "POST" })
	.validator(portalSlugSchema)
	.handler(async ({ data: { slug } }) => {
		await data.signOut(getCookie(portalCookieName(slug)));
		deleteCookie(portalCookieName(slug), { path: "/" });
		return { ok: true };
	});

export const getPortalHome = createServerFn({ method: "GET" })
	.validator(portalSlugSchema)
	.handler(async ({ data: { slug } }) => {
		const scope = await requirePortal(slug);
		return {
			portal: {
				workspaceName: scope.workspaceName,
				firstName: scope.firstName,
				lastName: scope.lastName,
				companyContact: scope.companyId !== null,
			},
			...(await data.portalHome(scope)),
		};
	});

function portalHeader(scope: data.PortalScope) {
	return {
		workspaceName: scope.workspaceName,
		firstName: scope.firstName,
		lastName: scope.lastName,
		companyContact: scope.companyId !== null,
	};
}

export const getPortalProfile = createServerFn({ method: "GET" })
	.validator(portalSlugSchema)
	.handler(async ({ data: { slug } }) => {
		const scope = await requirePortal(slug);
		return {
			portal: portalHeader(scope),
			profile: await data.portalProfile(scope),
		};
	});

export const updatePortalProfile = createServerFn({ method: "POST" })
	.validator(updatePortalProfileSchema)
	.handler(async ({ data: { slug, profile } }) => {
		const scope = await requirePortal(slug);
		return data.updatePortalProfile(scope, profile);
	});

export type PortalHome = Awaited<ReturnType<typeof getPortalHome>>;
export type PortalProfile = Awaited<ReturnType<typeof getPortalProfile>>;
export type ContactPortal = Awaited<ReturnType<typeof getContactPortal>>;
