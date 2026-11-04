import { z } from "zod";
import { emailSchema } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";

// Customer portal (spec §8), phase 4. Owner decisions 2026-11-04: staff invite
// a contact first, then the contact can request links themselves; a contact
// can be a "company contact" who also sees their company's records; sessions
// last 30 days; editors and up invite and revoke.

export const PORTAL_LIMITS = {
	tokenMinutes: 15,
	sessionDays: 30,
	// Link requests per address in 15 minutes, and per IP in an hour (matched
	// or not); links sent per contact in 15 minutes
	linksPerContact: 3,
	linksPerIp: 20,
	// Caps that keep the shared email quota safe (Resend free: 100 a day)
	linksPerContactDay: 10,
	linksPerWorkspaceDay: 50,
	listed: 20,
} as const;

// Workspace slugs as Better Auth stores them
export const slugSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9][a-z0-9-]{0,62}$/, {
		error: () => m.error_portal_not_found(),
	});

// 32 random bytes, base64url without padding
export const tokenSchema = z
	.string()
	.regex(/^[A-Za-z0-9_-]{43}$/, { error: () => m.error_portal_link_invalid() });

export const requestLinkSchema = z.object({
	slug: slugSchema,
	email: emailSchema,
});
export const signInSchema = z.object({ slug: slugSchema, token: tokenSchema });
export const portalSlugSchema = z.object({ slug: slugSchema });

const id = z.uuid({ error: () => m.validation_invalid_id() });
export const contactPortalSchema = z.object({ contactId: id });
export const companyAccessSchema = z.object({
	contactId: id,
	companyAccess: z.boolean(),
});

// The portal session cookie: one per workspace, so a person can be signed in
// to two workspaces' portals at once. Path "/" because server functions are
// served from their own path; staff sessions use a different cookie and table.
export function portalCookieName(slug: string) {
	return `portal_session.${slug}`;
}
