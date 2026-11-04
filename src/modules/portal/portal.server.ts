import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "#/db/index";
import {
	contact,
	invoice,
	organization,
	portalAccess,
	portalLinkRequest,
	portalSession,
	portalToken,
	project,
	quote,
} from "#/db/schema";
import { sendPortalLinkEmail } from "#/lib/email";
import { m } from "#/paraglide/messages.js";
import { type Actor, eventInsert } from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import { PORTAL_LIMITS } from "./schema";

// Server-only data layer for the customer portal (spec §8). Two levels of
// isolation, always together: the workspace, found from the portal's slug,
// and the contact's scope (their own records, plus their company's when
// staff made them a company contact). Portal callers never pass a workspace
// or contact id: both come from the portal session.

const MINUTE = 60_000;
const DAY = 86_400_000;

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function errorCode(error: unknown) {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code ?? e?.cause?.code;
}

function memberActorId(actor: Actor) {
	return actor.type === "member" ? actor.id : null;
}

// --- Tokens -----------------------------------------------------------------

function base64url(bytes: Uint8Array) {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export function newSecret() {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashSecret(secret: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(secret),
	);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function workspaceBySlug(slug: string) {
	const [row] = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
		})
		.from(organization)
		.where(eq(organization.slug, slug))
		.limit(1);
	return row ?? null;
}

function portalUrl(baseUrl: string, slug: string, token: string) {
	return `${baseUrl.replace(/\/$/, "")}/p/${encodeURIComponent(slug)}/verify?token=${token}`;
}

// --- Staff: access per contact ----------------------------------------------

async function findContact(workspaceId: string, contactId: string) {
	const [row] = await db
		.select()
		.from(contact)
		.where(and(eq(contact.id, contactId), eq(contact.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_contact_not_found());
	return row;
}

export async function getPortalAccess(workspaceId: string, contactId: string) {
	await findContact(workspaceId, contactId);
	const [row] = await db
		.select({
			companyAccess: portalAccess.companyAccess,
			companyId: portalAccess.companyId,
			invitedAt: portalAccess.invitedAt,
			revokedAt: portalAccess.revokedAt,
			lastSignInAt: portalAccess.lastSignInAt,
		})
		.from(portalAccess)
		.where(
			and(
				eq(portalAccess.workspaceId, workspaceId),
				eq(portalAccess.contactId, contactId),
			),
		)
		.limit(1);
	return row ?? null;
}

// Statements that sign a contact out everywhere and burn their unused links,
// for the batch of any change that must end access: revoking, archiving,
// merging, a new email address (spec §8)
export function endPortalSessions(workspaceId: string, contactId: string) {
	return [
		db
			.delete(portalSession)
			.where(
				and(
					eq(portalSession.workspaceId, workspaceId),
					eq(portalSession.contactId, contactId),
				),
			),
		db
			.update(portalToken)
			.set({ usedAt: new Date() })
			.where(
				and(
					eq(portalToken.workspaceId, workspaceId),
					eq(portalToken.contactId, contactId),
					isNull(portalToken.usedAt),
				),
			),
	];
}

// Merging contacts: the kept contact takes over the duplicate's portal access
// unless it has its own; the duplicate is signed out
export function mergePortalAccess(
	workspaceId: string,
	keepId: string,
	duplicateId: string,
) {
	return [
		db
			.update(portalAccess)
			.set({ contactId: keepId, companyAccess: false, companyId: null })
			.where(
				and(
					eq(portalAccess.workspaceId, workspaceId),
					eq(portalAccess.contactId, duplicateId),
					sql`not exists (select 1 from "portal_access" k where k."workspace_id" = ${workspaceId} and k."contact_id" = ${keepId})`,
				),
			),
		...endPortalSessions(workspaceId, duplicateId),
	];
}

// Links sent to a contact recently: invites and self-service together
async function linksSent(workspaceId: string, contactId: string) {
	const now = Date.now();
	const [[recent], [today], [workspaceToday]] = await Promise.all([
		db
			.select({ n: count() })
			.from(portalToken)
			.where(
				and(
					eq(portalToken.workspaceId, workspaceId),
					eq(portalToken.contactId, contactId),
					gte(portalToken.createdAt, new Date(now - 15 * MINUTE)),
				),
			),
		db
			.select({ n: count() })
			.from(portalToken)
			.where(
				and(
					eq(portalToken.workspaceId, workspaceId),
					eq(portalToken.contactId, contactId),
					gte(portalToken.createdAt, new Date(now - DAY)),
				),
			),
		db
			.select({ n: count() })
			.from(portalToken)
			.where(
				and(
					eq(portalToken.workspaceId, workspaceId),
					gte(portalToken.createdAt, new Date(now - DAY)),
				),
			),
	]);
	return {
		allowed:
			recent.n < PORTAL_LIMITS.linksPerContact &&
			today.n < PORTAL_LIMITS.linksPerContactDay &&
			workspaceToday.n < PORTAL_LIMITS.linksPerWorkspaceDay,
	};
}

// A link insert that only happens while the contact is under the limits,
// counted inside the statement under a per-contact lock (so requests arriving
// together can't all pass)
function guardedLinks(workspaceId: string, contactId: string) {
	return [
		db
			.select({
				locked: sql`pg_advisory_xact_lock(hashtext(${`portal-link:${workspaceId}:${contactId}`}))::text`,
			})
			.from(organization)
			.where(eq(organization.id, workspaceId)),
		db
			.select({
				ok: sql<number>`1 / (case when (select count(*) from "portal_token" t where t."workspace_id" = ${workspaceId} and t."contact_id" = ${contactId} and t."created_at" >= now() - interval '15 minutes') < ${PORTAL_LIMITS.linksPerContact} and (select count(*) from "portal_token" t where t."workspace_id" = ${workspaceId} and t."contact_id" = ${contactId} and t."created_at" >= now() - interval '1 day') < ${PORTAL_LIMITS.linksPerContactDay} then 1 else 0 end)`,
			})
			.from(organization)
			.where(eq(organization.id, workspaceId)),
	];
}

// Turns access on (or back on) and emails a sign-in link. A contact back from
// revoked starts with no old sessions.
export async function inviteContact(
	workspaceId: string,
	actor: Actor,
	contactId: string,
	baseUrl: string,
) {
	const c = await findContact(workspaceId, contactId);
	if (c.archivedAt) throw clientError(409, m.error_record_archived());
	if (!c.email) throw clientError(409, m.error_portal_no_email());
	const before = await getPortalAccess(workspaceId, contactId);
	if (!(await linksSent(workspaceId, contactId)).allowed)
		throw clientError(429, m.error_portal_too_many_links());
	const [workspace] = await db
		.select({ name: organization.name, slug: organization.slug })
		.from(organization)
		.where(eq(organization.id, workspaceId))
		.limit(1);
	const token = newSecret();
	const now = new Date();
	try {
		await db.batch([
			...guardedLinks(workspaceId, contactId),
			...(before?.revokedAt ? endPortalSessions(workspaceId, contactId) : []),
			db
				.insert(portalAccess)
				.values({
					id: uuidv7(),
					workspaceId,
					contactId,
					invitedById: memberActorId(actor),
					invitedAt: now,
				})
				.onConflictDoUpdate({
					target: [portalAccess.workspaceId, portalAccess.contactId],
					set: {
						revokedAt: null,
						invitedAt: now,
						invitedById: memberActorId(actor),
					},
				}),
			db.insert(portalToken).values({
				id: uuidv7(),
				workspaceId,
				contactId,
				tokenHash: await hashSecret(token),
				expiresAt: new Date(
					now.getTime() + PORTAL_LIMITS.tokenMinutes * MINUTE,
				),
			}),
			eventInsert(workspaceId, actor, {
				type: "contact.portal_invited",
				subjectType: "contact",
				subjectId: contactId,
			}),
		] as unknown as Parameters<typeof db.batch>[0]);
	} catch (error) {
		if (errorCode(error) === "22012")
			throw clientError(429, m.error_portal_too_many_links());
		throw error;
	}
	await sendPortalLinkEmail({
		to: c.email,
		name: c.firstName,
		workspaceName: workspace.name,
		url: portalUrl(baseUrl, workspace.slug, token),
		locale: c.locale ?? "en",
		invited: true,
	});
	return { contactId };
}

// Ends access and every session at once. The access row is locked first, so a
// sign-in finishing at the same moment either completes before (and its
// session is deleted here) or sees the access revoked
export async function revokePortalAccess(
	workspaceId: string,
	actor: Actor,
	contactId: string,
) {
	const access = await getPortalAccess(workspaceId, contactId);
	if (!access || access.revokedAt) return { contactId };
	await db.batch([
		db
			.select({ id: portalAccess.id })
			.from(portalAccess)
			.where(
				and(
					eq(portalAccess.workspaceId, workspaceId),
					eq(portalAccess.contactId, contactId),
				),
			)
			.for("update"),
		db
			.update(portalAccess)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(portalAccess.workspaceId, workspaceId),
					eq(portalAccess.contactId, contactId),
				),
			),
		...endPortalSessions(workspaceId, contactId),
		eventInsert(workspaceId, actor, {
			type: "contact.portal_revoked",
			subjectType: "contact",
			subjectId: contactId,
		}),
	] as unknown as Parameters<typeof db.batch>[0]);
	return { contactId };
}

// Company access is granted for the contact's current company; if the
// contact moves to another company it stops applying until granted again
export async function setCompanyAccess(
	workspaceId: string,
	actor: Actor,
	contactId: string,
	companyAccess: boolean,
) {
	const c = await findContact(workspaceId, contactId);
	const access = await getPortalAccess(workspaceId, contactId);
	if (!access || access.revokedAt)
		throw clientError(409, m.error_portal_not_invited());
	if (companyAccess && !c.companyId)
		throw clientError(409, m.error_portal_no_company());
	const companyId = companyAccess ? c.companyId : null;
	if (access.companyAccess === companyAccess && access.companyId === companyId)
		return { contactId };
	await db.batch([
		db
			.update(portalAccess)
			.set({ companyAccess, companyId })
			.where(
				and(
					eq(portalAccess.workspaceId, workspaceId),
					eq(portalAccess.contactId, contactId),
				),
			),
		eventInsert(workspaceId, actor, {
			type: companyAccess
				? "contact.portal_company_on"
				: "contact.portal_company_off",
			subjectType: "contact",
			subjectId: contactId,
		}),
	]);
	return { contactId };
}

// --- Portal: sign-in --------------------------------------------------------

// Sends work after the answer where the runtime allows it (Workers'
// waitUntil), so a known address answers as fast as an unknown one
async function inBackground(work: Promise<unknown>) {
	try {
		const workers: { waitUntil?: (promise: Promise<unknown>) => void } =
			await import("cloudflare:workers");
		if (typeof workers.waitUntil === "function") {
			workers.waitUntil(work.catch(() => {}));
			return;
		}
	} catch {
		// Not on the Workers runtime (tests, scripts): wait for it
	}
	await work.catch(() => {});
}

// Always the same answer, after the same queries, whether or not the address
// has access, so neither the answer nor its timing reveals portal users.
// Every request counts toward the limits, matched or not.
export async function requestLink(
	slug: string,
	email: string,
	ip: string | null,
	baseUrl: string,
) {
	const workspace = await workspaceBySlug(slug);
	const emailHash = await hashSecret(email.toLowerCase());
	const now = Date.now();
	const [[c], [byEmail], [byIp]] = await Promise.all([
		workspace
			? db
					.select({
						id: contact.id,
						firstName: contact.firstName,
						email: contact.email,
						locale: contact.locale,
					})
					.from(contact)
					.innerJoin(
						portalAccess,
						and(
							eq(portalAccess.contactId, contact.id),
							eq(portalAccess.workspaceId, contact.workspaceId),
							isNull(portalAccess.revokedAt),
						),
					)
					.where(
						and(
							eq(contact.workspaceId, workspace.id),
							isNull(contact.archivedAt),
							sql`lower(${contact.email}) = ${email.toLowerCase()}`,
						),
					)
					.orderBy(asc(contact.createdAt))
					.limit(1)
			: Promise.resolve([]),
		db
			.select({ n: count() })
			.from(portalLinkRequest)
			.where(
				and(
					eq(portalLinkRequest.emailHash, emailHash),
					workspace
						? eq(portalLinkRequest.workspaceId, workspace.id)
						: isNull(portalLinkRequest.workspaceId),
					gte(portalLinkRequest.createdAt, new Date(now - 15 * MINUTE)),
				),
			),
		ip
			? db
					.select({ n: count() })
					.from(portalLinkRequest)
					.where(
						and(
							eq(portalLinkRequest.ip, ip),
							gte(portalLinkRequest.createdAt, new Date(now - 60 * MINUTE)),
						),
					)
			: Promise.resolve([{ n: 0 }]),
	]);
	await db.insert(portalLinkRequest).values({
		id: uuidv7(),
		workspaceId: workspace?.id ?? null,
		emailHash,
		ip,
	});
	if (
		!workspace ||
		!c?.email ||
		byEmail.n >= PORTAL_LIMITS.linksPerContact ||
		byIp.n >= PORTAL_LIMITS.linksPerIp
	)
		return { sent: true };

	const to = c.email;
	await inBackground(
		(async () => {
			if (!(await linksSent(workspace.id, c.id)).allowed) return;
			const token = newSecret();
			await db.batch([
				...guardedLinks(workspace.id, c.id),
				db.insert(portalToken).values({
					id: uuidv7(),
					workspaceId: workspace.id,
					contactId: c.id,
					tokenHash: await hashSecret(token),
					expiresAt: new Date(Date.now() + PORTAL_LIMITS.tokenMinutes * MINUTE),
					requestedIp: ip,
				}),
			] as unknown as Parameters<typeof db.batch>[0]);
			await sendPortalLinkEmail({
				to,
				name: c.firstName,
				workspaceName: workspace.name,
				url: portalUrl(baseUrl, workspace.slug, token),
				locale: c.locale ?? "en",
				invited: false,
			});
		})(),
	);
	return { sent: true };
}

// Trades a link for a session: the token must be this workspace's, unused,
// unexpired, and its contact must still have access. Used once, also when two
// requests arrive together; the access row is locked too, so a revoke at the
// same moment can't leave a session behind.
export async function signIn(
	slug: string,
	token: string,
	client: { ip: string | null; userAgent: string | null },
) {
	const invalid = () => clientError(400, m.error_portal_link_invalid());
	const workspace = await workspaceBySlug(slug);
	if (!workspace) throw invalid();
	const tokenHash = await hashSecret(token);
	const now = new Date();
	const [row] = await db
		.select({ id: portalToken.id, contactId: portalToken.contactId })
		.from(portalToken)
		.innerJoin(
			portalAccess,
			and(
				eq(portalAccess.workspaceId, portalToken.workspaceId),
				eq(portalAccess.contactId, portalToken.contactId),
				isNull(portalAccess.revokedAt),
			),
		)
		.innerJoin(
			contact,
			and(
				eq(contact.id, portalToken.contactId),
				eq(contact.workspaceId, portalToken.workspaceId),
				isNull(contact.archivedAt),
			),
		)
		.where(
			and(
				eq(portalToken.tokenHash, tokenHash),
				eq(portalToken.workspaceId, workspace.id),
				isNull(portalToken.usedAt),
				gt(portalToken.expiresAt, now),
			),
		)
		.limit(1);
	if (!row) throw invalid();

	const session = newSecret();
	const expiresAt = new Date(now.getTime() + PORTAL_LIMITS.sessionDays * DAY);
	const accessRow = and(
		eq(portalAccess.workspaceId, workspace.id),
		eq(portalAccess.contactId, row.contactId),
	);
	try {
		await db.batch([
			db
				.select({ id: portalAccess.id })
				.from(portalAccess)
				.where(accessRow)
				.for("update"),
			db
				.select({ id: portalToken.id })
				.from(portalToken)
				.where(eq(portalToken.id, row.id))
				.for("update"),
			db
				.select({
					ok: sql<number>`1 / (case when exists (select 1 from "portal_token" t where t."id" = ${row.id} and t."used_at" is null) and exists (select 1 from "portal_access" a where a."workspace_id" = ${workspace.id} and a."contact_id" = ${row.contactId} and a."revoked_at" is null) then 1 else 0 end)`,
				})
				.from(portalToken)
				.where(eq(portalToken.id, row.id)),
			db
				.update(portalToken)
				.set({ usedAt: now })
				.where(eq(portalToken.id, row.id)),
			db.insert(portalSession).values({
				id: uuidv7(),
				workspaceId: workspace.id,
				contactId: row.contactId,
				tokenHash: await hashSecret(session),
				expiresAt,
				ip: client.ip,
				userAgent: client.userAgent?.slice(0, 300) ?? null,
			}),
			db.update(portalAccess).set({ lastSignInAt: now }).where(accessRow),
		]);
	} catch (error) {
		if (errorCode(error) === "22012") throw invalid();
		throw error;
	}
	return { session, expiresAt };
}

export type PortalScope = {
	workspaceId: string;
	workspaceName: string;
	slug: string;
	contactId: string;
	firstName: string;
	lastName: string | null;
	locale: string | null;
	// Set only for a company contact still at the company access was granted
	// for: that company's records are in scope too
	companyId: string | null;
};

// The signed-in contact for this portal, or null. The session must be this
// workspace's and unexpired, its contact active and still invited.
export async function resolvePortalSession(
	slug: string,
	session: string | null | undefined,
): Promise<PortalScope | null> {
	if (!session || !/^[A-Za-z0-9_-]{43}$/.test(session)) return null;
	const [row] = await db
		.select({
			workspaceId: organization.id,
			workspaceName: organization.name,
			slug: organization.slug,
			contactId: contact.id,
			firstName: contact.firstName,
			lastName: contact.lastName,
			locale: contact.locale,
			contactCompanyId: contact.companyId,
			companyAccess: portalAccess.companyAccess,
			grantedCompanyId: portalAccess.companyId,
		})
		.from(portalSession)
		.innerJoin(organization, eq(organization.id, portalSession.workspaceId))
		.innerJoin(
			contact,
			and(
				eq(contact.id, portalSession.contactId),
				eq(contact.workspaceId, portalSession.workspaceId),
				isNull(contact.archivedAt),
			),
		)
		.innerJoin(
			portalAccess,
			and(
				eq(portalAccess.workspaceId, portalSession.workspaceId),
				eq(portalAccess.contactId, portalSession.contactId),
				isNull(portalAccess.revokedAt),
			),
		)
		.where(
			and(
				eq(portalSession.tokenHash, await hashSecret(session)),
				eq(organization.slug, slug),
				gt(portalSession.expiresAt, new Date()),
			),
		)
		.limit(1);
	if (!row) return null;
	const { contactCompanyId, companyAccess, grantedCompanyId, ...scope } = row;
	return {
		...scope,
		companyId:
			companyAccess && contactCompanyId && contactCompanyId === grantedCompanyId
				? contactCompanyId
				: null,
	};
}

export async function signOut(session: string | null | undefined) {
	if (!session || !/^[A-Za-z0-9_-]{43}$/.test(session)) return;
	await db
		.delete(portalSession)
		.where(eq(portalSession.tokenHash, await hashSecret(session)));
}

// --- Portal: what the contact sees ------------------------------------------

// Records in the contact's scope: in their workspace, and theirs (or, for a
// company contact, their company's). Every portal query uses this.
export function inScope(
	scope: PortalScope,
	table: { workspaceId: PgColumn; contactId: PgColumn; companyId: PgColumn },
): SQL {
	const own = eq(table.contactId, scope.contactId);
	return and(
		eq(table.workspaceId, scope.workspaceId),
		scope.companyId ? or(own, eq(table.companyId, scope.companyId)) : own,
	) as SQL;
}

// Home: open quotes, invoices still to pay, active projects. Drafts, voided
// and archived records never show.
export async function portalHome(scope: PortalScope) {
	const [quotes, invoices, projects] = await Promise.all([
		db
			.select({
				id: quote.id,
				number: quote.number,
				currency: quote.currency,
				totalCents: quote.totalCents,
				validUntil: quote.validUntil,
				sentAt: quote.sentAt,
			})
			.from(quote)
			.where(
				and(
					inScope(scope, quote),
					eq(quote.status, "sent"),
					isNull(quote.archivedAt),
				),
			)
			.orderBy(desc(quote.sentAt))
			.limit(PORTAL_LIMITS.listed),
		db
			.select({
				id: invoice.id,
				year: invoice.year,
				number: invoice.number,
				status: invoice.status,
				currency: invoice.currency,
				totalCents: invoice.totalCents,
				paidCents: invoice.paidCents,
				dueDate: invoice.dueDate,
			})
			.from(invoice)
			.where(
				and(
					inScope(scope, invoice),
					inArray(invoice.status, ["issued", "partially_paid"]),
					isNull(invoice.archivedAt),
				),
			)
			.orderBy(asc(invoice.dueDate))
			.limit(PORTAL_LIMITS.listed),
		db
			.select({
				id: project.id,
				name: project.name,
				status: project.status,
				dueDate: project.dueDate,
			})
			.from(project)
			.where(
				and(
					inScope(scope, project),
					inArray(project.status, ["planned", "active", "on_hold"]),
					isNull(project.archivedAt),
				),
			)
			.orderBy(asc(project.dueDate))
			.limit(PORTAL_LIMITS.listed),
	]);
	return { quotes, invoices, projects };
}

// Staff view of a contact's portal: still-valid sessions count
export async function activeSessions(workspaceId: string, contactId: string) {
	const [{ n }] = await db
		.select({ n: count() })
		.from(portalSession)
		.where(
			and(
				eq(portalSession.workspaceId, workspaceId),
				eq(portalSession.contactId, contactId),
				gt(portalSession.expiresAt, new Date()),
			),
		);
	return n;
}
