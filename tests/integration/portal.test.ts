import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#/db/index";
import { invoice, portalToken, quote } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as invoices from "#/modules/invoices/invoices.server";
import * as portal from "#/modules/portal/portal.server";
import { PORTAL_LIMITS } from "#/modules/portal/schema";
import * as projects from "#/modules/projects/projects.server";
import * as quotes from "#/modules/quotes/quotes.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Customer portal, phase 4 step 1: invite, sign-in links (single use,
// expiry, rate limits, no hint of who has access), sessions (per workspace,
// ended by revoking), and the contact scope with and without company access.
// Emails print to the console in tests; the link is read from there.
let a: Workspace;
let b: Workspace;
let slugA: string;
let slugB: string;
const actorA = () => ({ type: "member" as const, id: a.userId });
const BASE = "http://localhost:3000";
const client = { ip: "203.0.113.7", userAgent: "test" };

let printed: string[] = [];
let spy: ReturnType<typeof spyOn>;
beforeEach(() => {
	printed = [];
	spy = spyOn(console, "info").mockImplementation((...args: unknown[]) => {
		printed.push(args.join(" "));
	});
});
afterEach(() => spy.mockRestore());

// The token of the last link emailed
function lastToken() {
	const match = [...printed]
		.reverse()
		.join("\n")
		.match(/\/verify\?token=([A-Za-z0-9_-]{43})/);
	return match?.[1] ?? null;
}

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

const person = (
	firstName: string,
	email: string,
	companyId = "",
): ContactInput => ({
	firstName,
	lastName: "",
	email,
	phone: "",
	jobTitle: "",
	companyId,
	ownerId: "",
	lifecycleStage: "customer",
	locale: "es",
	emailConsent: "unknown",
});

async function slugOf(w: Workspace) {
	const { organization } = await import("#/db/schema");
	const [row] = await db
		.select({ slug: organization.slug })
		.from(organization)
		.where(eq(organization.id, w.workspaceId));
	return row.slug;
}

async function invitedSession(contactId: string, slug: string) {
	await portal.inviteContact(a.workspaceId, actorA(), contactId, BASE);
	const token = lastToken();
	if (!token) throw new Error("no link printed");
	return (await portal.signIn(slug, token, client)).session;
}

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("pta"), createWorkspace("ptb")]);
	[slugA, slugB] = await Promise.all([slugOf(a), slugOf(b)]);
});
afterAll(cleanup);

describe("customer portal", () => {
	test("an invite emails a link that signs in once, in the contact's language", async () => {
		const ana = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Ana", "ana@example.com"),
		);
		await portal.inviteContact(a.workspaceId, actorA(), ana.id, BASE);
		expect(printed.join("\n")).toContain("portal de clientes");
		const token = lastToken();
		if (!token) throw new Error("no link printed");
		const { session } = await portal.signIn(slugA, token, client);
		const scope = await portal.resolvePortalSession(slugA, session);
		expect([scope?.contactId, scope?.workspaceId, scope?.companyId]).toEqual([
			ana.id,
			a.workspaceId,
			null,
		]);
		// The same link again: refused
		expect(await status(portal.signIn(slugA, token, client))).toBe(400);
		// Another workspace's portal doesn't know this session
		expect(await portal.resolvePortalSession(slugB, session)).toBeNull();
		// Two presses of one fresh link at the same moment: one session
		await portal.requestLink(slugA, "ANA@example.com", client.ip, BASE);
		const fresh = lastToken();
		if (!fresh) throw new Error("no link printed");
		const results = await Promise.all([
			status(portal.signIn(slugA, fresh, client)),
			status(portal.signIn(slugA, fresh, client)),
		]);
		expect(results.sort()).toEqual([200, 400]);
		// Signing out ends that session only
		await portal.signOut(session);
		expect(await portal.resolvePortalSession(slugA, session)).toBeNull();
	});

	test("links: no hint who has access, expiry, rate limits, wrong portal", async () => {
		const ben = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Ben", "ben@example.com"),
		);
		// Not invited, unknown, or an unknown portal: the same answer, no email
		for (const [slug, email] of [
			[slugA, "ben@example.com"],
			[slugA, "nobody@example.com"],
			["no-such-portal", "ben@example.com"],
		]) {
			expect(await portal.requestLink(slug, email, client.ip, BASE)).toEqual({
				sent: true,
			});
		}
		expect(lastToken()).toBeNull();

		await portal.inviteContact(a.workspaceId, actorA(), ben.id, BASE);
		// The invite counts toward the 3 per 15 minutes
		for (let i = 1; i < PORTAL_LIMITS.linksPerContact + 2; i++) {
			printed = [];
			await portal.requestLink(slugA, "ben@example.com", client.ip, BASE);
			if (i < PORTAL_LIMITS.linksPerContact) expect(lastToken()).not.toBeNull();
			else expect(lastToken()).toBeNull();
		}

		// An expired link, and a link used on another workspace's portal
		const expired = portal.newSecret();
		await db.insert(portalToken).values({
			id: crypto.randomUUID(),
			workspaceId: a.workspaceId,
			contactId: ben.id,
			tokenHash: await portal.hashSecret(expired),
			expiresAt: new Date(Date.now() - 1000),
		});
		expect(await status(portal.signIn(slugA, expired, client))).toBe(400);
		const other = portal.newSecret();
		await db.insert(portalToken).values({
			id: crypto.randomUUID(),
			workspaceId: a.workspaceId,
			contactId: ben.id,
			tokenHash: await portal.hashSecret(other),
			expiresAt: new Date(Date.now() + 60_000),
		});
		expect(await status(portal.signIn(slugB, other, client))).toBe(400);
	});

	test("revoking ends sessions and unused links; inviting again restores access", async () => {
		const cy = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Cy", "cy@example.com"),
		);
		const session = await invitedSession(cy.id, slugA);
		await portal.requestLink(slugA, "cy@example.com", client.ip, BASE);
		const unused = lastToken();
		if (!unused) throw new Error("no link printed");
		await portal.revokePortalAccess(a.workspaceId, actorA(), cy.id);
		expect(await portal.resolvePortalSession(slugA, session)).toBeNull();
		expect(await status(portal.signIn(slugA, unused, client))).toBe(400);
		// Revoked: asking for a link sends nothing
		printed = [];
		await portal.requestLink(slugA, "cy@example.com", client.ip, BASE);
		expect(lastToken()).toBeNull();
		const again = await invitedSession(cy.id, slugA);
		expect((await portal.resolvePortalSession(slugA, again))?.contactId).toBe(
			cy.id,
		);
		// An archived contact is signed out too
		await contacts.setContactArchived(a.workspaceId, actorA(), cy.id, true);
		expect(await portal.resolvePortalSession(slugA, again)).toBeNull();
	});

	test("a contact sees only their records; a company contact also the company's", async () => {
		const acme = await contacts.createCompany(a.workspaceId, actorA(), {
			name: "Acme",
			domain: "",
			phone: "",
			city: "",
			country: "",
			ownerId: "",
		});
		const dana = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Dana", "dana@example.com", acme.id),
		);
		const eli = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Eli", "eli@example.com", acme.id),
		);
		// Dana: an issued invoice and a draft one. Eli: a sent quote for Acme.
		const issued = await invoices.createInvoice(a.workspaceId, actorA(), {
			contactId: dana.id,
		});
		await db
			.update(invoice)
			.set({ status: "issued", totalCents: 5000 })
			.where(eq(invoice.id, issued.id));
		await invoices.createInvoice(a.workspaceId, actorA(), {
			contactId: dana.id,
		});
		const eliQuote = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: eli.id,
		});
		await db
			.update(quote)
			.set({ status: "sent", companyId: acme.id, sentAt: new Date() })
			.where(eq(quote.id, eliQuote.id));
		await projects.createProject(a.workspaceId, actorA(), {
			name: "Eli's project",
			description: "",
			status: "active",
			startDate: "",
			dueDate: "",
			ownerId: "",
			contactId: eli.id,
			companyId: "",
		});

		const session = await invitedSession(dana.id, slugA);
		const scope = await portal.resolvePortalSession(slugA, session);
		if (!scope) throw new Error("no scope");
		const own = await portal.portalHome(scope);
		expect(own.invoices.map((i) => i.id)).toEqual([issued.id]);
		expect([own.quotes.length, own.projects.length]).toEqual([0, 0]);

		// As a company contact, Dana also sees Acme's quote, not Eli's own
		// project (it isn't Acme's)
		await portal.setCompanyAccess(a.workspaceId, actorA(), dana.id, true);
		const wider = await portal.resolvePortalSession(slugA, session);
		if (!wider) throw new Error("no scope");
		expect(wider.companyId).toBe(acme.id);
		const company = await portal.portalHome(wider);
		expect(company.quotes.map((q) => q.id)).toEqual([eliQuote.id]);
		expect(company.projects).toEqual([]);

		// Eli, without company access, never sees Dana's invoice
		const eliSession = await invitedSession(eli.id, slugA);
		const eliScope = await portal.resolvePortalSession(slugA, eliSession);
		if (!eliScope) throw new Error("no scope");
		const eliHome = await portal.portalHome(eliScope);
		expect(eliHome.invoices).toEqual([]);
		expect(eliHome.projects.map((p) => p.name)).toEqual(["Eli's project"]);
	});

	test("links sent at once stay within the limit; invites count too", async () => {
		const gil = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Gil", "gil@example.com"),
		);
		await portal.inviteContact(a.workspaceId, actorA(), gil.id, BASE);
		await Promise.all(
			Array.from({ length: 6 }, () =>
				portal.requestLink(
					slugA,
					"gil@example.com",
					`198.51.100.${Math.floor(Math.random() * 200)}`,
					BASE,
				),
			),
		);
		const tokens = await db
			.select({ id: portalToken.id })
			.from(portalToken)
			.where(eq(portalToken.contactId, gil.id));
		expect(tokens.length).toBeLessThanOrEqual(PORTAL_LIMITS.linksPerContact);
		// Staff pressing "Send new link" again is refused past the limit
		expect(
			await status(portal.inviteContact(a.workspaceId, actorA(), gil.id, BASE)),
		).toBe(429);
	});

	test("a new email, archiving or merging ends portal sessions", async () => {
		const hal = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Hal", "hal@example.com"),
		);
		const first = await invitedSession(hal.id, slugA);
		// Staff give the contact a new address: whoever had the old one is out
		await contacts.updateContact(
			a.workspaceId,
			actorA(),
			hal.id,
			person("Hal", "hal.new@example.com"),
		);
		expect(await portal.resolvePortalSession(slugA, first)).toBeNull();
		// Archived, then restored: old sessions stay ended
		const second = await invitedSession(hal.id, slugA);
		await contacts.setContactArchived(a.workspaceId, actorA(), hal.id, true);
		await contacts.setContactArchived(a.workspaceId, actorA(), hal.id, false);
		expect(await portal.resolvePortalSession(slugA, second)).toBeNull();
		// Merged into another contact: the kept one takes over the access
		const ivy = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Ivy", "ivy@example.com"),
		);
		const third = await invitedSession(hal.id, slugA);
		await contacts.mergeContacts(a.workspaceId, actorA(), {
			keepId: ivy.id,
			duplicateId: hal.id,
			choices: {},
		});
		expect(await portal.resolvePortalSession(slugA, third)).toBeNull();
		const moved = await portal.getPortalAccess(a.workspaceId, ivy.id);
		expect(moved?.revokedAt).toBeNull();
	});

	test("company access applies only to the company it was granted for", async () => {
		const [one, two] = await Promise.all(
			["One Co", "Two Co"].map((name) =>
				contacts.createCompany(a.workspaceId, actorA(), {
					name,
					domain: "",
					phone: "",
					city: "",
					country: "",
					ownerId: "",
				}),
			),
		);
		const jo = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Jo", "jo@example.com", one.id),
		);
		const session = await invitedSession(jo.id, slugA);
		await portal.setCompanyAccess(a.workspaceId, actorA(), jo.id, true);
		expect((await portal.resolvePortalSession(slugA, session))?.companyId).toBe(
			one.id,
		);
		// Moved to another company: no company records until granted again
		await contacts.updateContact(
			a.workspaceId,
			actorA(),
			jo.id,
			person("Jo", "jo@example.com", two.id),
		);
		const after = await portal.resolvePortalSession(slugA, session);
		expect([after?.contactId, after?.companyId]).toEqual([jo.id, null]);
	});

	test("staff changes stay in their workspace; no access without an email", async () => {
		const fay = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Fay", ""),
		);
		expect(
			await status(portal.inviteContact(a.workspaceId, actorA(), fay.id, BASE)),
		).toBe(409);
		const actorB = { type: "member" as const, id: b.userId };
		for (const call of [
			() => portal.inviteContact(b.workspaceId, actorB, fay.id, BASE),
			() => portal.revokePortalAccess(b.workspaceId, actorB, fay.id),
			() => portal.setCompanyAccess(b.workspaceId, actorB, fay.id, true),
			() => portal.getPortalAccess(b.workspaceId, fay.id),
		]) {
			expect(await status(call())).toBe(404);
		}
		// Malformed sessions are just "signed out"
		for (const bad of [undefined, "", "x".repeat(43), "not a token"]) {
			expect(await portal.resolvePortalSession(slugA, bad)).toBeNull();
		}
	});
});
