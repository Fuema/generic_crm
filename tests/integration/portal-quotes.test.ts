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
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event, organization, quote, user } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as fields from "#/modules/fields/fields.server";
import * as portal from "#/modules/portal/portal.server";
import * as quotes from "#/modules/quotes/quotes.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Customer portal, phase 4 step 3: quotes. The contact sees their sent,
// accepted and declined quotes (never drafts, archived or someone else's),
// accepts with a typed name or declines with an optional reason, always for
// the version they saw; the decision records who, when and from where, a
// member responsible gets an email, and the deal is left to staff.
let a: Workspace;
let b: Workspace;
let slug: string;
const actor = () => ({ type: "member" as const, id: a.userId });
const client = { ip: "203.0.113.9", userAgent: "test browser" };
const BASE = "http://x";

let printed: string[] = [];
let spy: ReturnType<typeof spyOn>;
beforeEach(() => {
	printed = [];
	spy = spyOn(console, "info").mockImplementation((...args: unknown[]) => {
		printed.push(args.join(" "));
	});
});
afterEach(() => spy.mockRestore());

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
	locale: "en",
	emailConsent: "unknown",
});

async function sessionFor(contactId: string) {
	await portal.inviteContact(a.workspaceId, actor(), contactId, BASE);
	const token = printed
		.join("\n")
		.match(/\/verify\?token=([A-Za-z0-9_-]{43})/)?.[1];
	if (!token) throw new Error("no link printed");
	const { session } = await portal.signIn(slug, token, client);
	printed = [];
	return session;
}

async function resolve(session: string) {
	const scope = await portal.resolvePortalSession(slug, session);
	if (!scope) throw new Error("no scope");
	return scope;
}

async function scopeFor(contactId: string) {
	return resolve(await sessionFor(contactId));
}

type Scope = Awaited<ReturnType<typeof scopeFor>>;

// Decide as the page does: for the version just shown
async function decide(
	scope: Scope,
	id: string,
	decision: { accept: true; name: string } | { accept: false; reason: string },
) {
	const { version } = await portal.portalQuote(scope, id);
	return portal.decidePortalQuote(
		scope,
		id,
		{ ...decision, version },
		client,
		BASE,
	);
}

// A quote for a contact, in a given state
async function quoteFor(
	contactId: string,
	state: Partial<typeof quote.$inferInsert> = {},
) {
	const { id } = await quotes.createQuote(a.workspaceId, actor(), {
		contactId,
	});
	await db
		.update(quote)
		.set({
			status: "sent",
			sentAt: new Date(),
			validUntil: new Date(Date.now() + 10 * 86_400_000),
			ownerId: a.userId,
			custom: { internal_margin: "40%", reference: "REF-1" },
			...state,
		})
		.where(eq(quote.id, id));
	return id;
}

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("pqa"), createWorkspace("pqb")]);
	const [row] = await db
		.select({ slug: organization.slug })
		.from(organization)
		.where(eq(organization.id, a.workspaceId));
	slug = row.slug;
	for (const [key, portalVisibility] of [
		["internal_margin", "hidden"],
		["reference", "read_only"],
	] as const)
		await fields.createField(
			a.workspaceId,
			actor(),
			{
				objectKey: "quote",
				type: "text",
				label: { en: key, es: key },
				help: { en: "", es: "" },
				options: [],
				required: false,
				unique: false,
				groupId: "",
				portalVisibility,
			},
			key,
		);
});
afterAll(cleanup);

describe("portal quotes", () => {
	test("the contact sees their sent and decided quotes, nothing else", async () => {
		const ana = await contacts.createContact(
			a.workspaceId,
			actor(),
			person("Ana", "ana.quotes@example.com"),
		);
		const ben = await contacts.createContact(
			a.workspaceId,
			actor(),
			person("Ben", "ben.quotes@example.com"),
		);
		const sent = await quoteFor(ana.id);
		await quoteFor(ana.id, { status: "draft", sentAt: null });
		await quoteFor(ana.id, { archivedAt: new Date() });
		const bens = await quoteFor(ben.id);
		const actorB = { type: "member" as const, id: b.userId };
		const other = await contacts.createContact(
			b.workspaceId,
			actorB,
			person("Other", "other.quotes@example.com"),
		);
		const elsewhere = await quotes.createQuote(b.workspaceId, actorB, {
			contactId: other.id,
		});
		const scope = await scopeFor(ana.id);

		expect((await portal.portalQuotes(scope)).map((q) => q.id)).toEqual([sent]);
		const detail = await portal.portalQuote(scope, sent);
		expect(detail.custom).toEqual({ reference: "REF-1" });
		expect(detail.fields.map((f) => f.key)).toEqual(["reference"]);
		// Ben's quote, or another workspace's: not found, not decidable
		for (const id of [bens, elsewhere.id]) {
			expect(await status(portal.portalQuote(scope, id))).toBe(404);
			expect(
				await status(
					portal.decidePortalQuote(
						scope,
						id,
						{ accept: true, name: "Ana", version: 0 },
						client,
						BASE,
					),
				),
			).toBe(404);
		}
	});

	test("accepting records the typed name, who and where; the owner is told; the deal waits", async () => {
		const cy = await contacts.createContact(
			a.workspaceId,
			actor(),
			person("Cy", "cy.quotes@example.com"),
		);
		const id = await quoteFor(cy.id);
		const scope = await scopeFor(cy.id);
		await decide(scope, id, { accept: true, name: "Cy Smith" });
		const [row] = await db.select().from(quote).where(eq(quote.id, id));
		expect([
			row.status,
			row.decidedVia,
			row.decidedByContactId,
			row.acceptedName,
			row.decidedIp,
			row.decidedUserAgent,
		]).toEqual([
			"accepted",
			"portal",
			cy.id,
			"Cy Smith",
			client.ip,
			client.userAgent,
		]);
		const [e] = await db
			.select()
			.from(event)
			.where(and(eq(event.subjectId, id), eq(event.type, "quote.accepted")));
		expect([e.actorType, e.actorId]).toEqual(["contact", cy.id]);
		// One email to the owner, in English and Spanish
		const mail = printed.join("\n");
		expect(mail).toContain("Cy accepted QUO-");
		expect(mail).toContain("aceptó");
		// Decided once: a second answer is refused
		expect(await status(decide(scope, id, { accept: false, reason: "" }))).toBe(
			409,
		);
	});

	test("a page showing an older version can't decide; staff decisions say so", async () => {
		const dan = await contacts.createContact(
			a.workspaceId,
			actor(),
			person("Dan", "dan.quotes@example.com"),
		);
		const id = await quoteFor(dan.id);
		const scope = await scopeFor(dan.id);
		const seen = (await portal.portalQuote(scope, id)).version;
		// Staff change the quote meanwhile (resent at a new price)
		await db
			.update(quote)
			.set({ totalCents: 99_900, updatedAt: new Date(seen + 1000) })
			.where(eq(quote.id, id));
		expect(
			await status(
				portal.decidePortalQuote(
					scope,
					id,
					{ accept: true, name: "Dan", version: seen },
					client,
					BASE,
				),
			),
		).toBe(409);
		// Staff accept it themselves: recorded as decided by staff
		await quotes.acceptQuote(a.workspaceId, actor(), id);
		const [row] = await db.select().from(quote).where(eq(quote.id, id));
		expect([row.status, row.decidedVia, row.acceptedName]).toEqual([
			"accepted",
			"staff",
			null,
		]);
	});

	test("declining keeps the reason; an expired quote can't be accepted", async () => {
		const dee = await contacts.createContact(
			a.workspaceId,
			actor(),
			person("Dee", "dee.quotes@example.com"),
		);
		const declined = await quoteFor(dee.id);
		const expired = await quoteFor(dee.id, {
			validUntil: new Date(Date.now() - 3 * 86_400_000),
		});
		const scope = await scopeFor(dee.id);
		await decide(scope, declined, { accept: false, reason: "Too expensive" });
		const [row] = await db.select().from(quote).where(eq(quote.id, declined));
		expect([row.status, row.declineReason, row.decidedVia]).toEqual([
			"declined",
			"Too expensive",
			"portal",
		]);
		expect(printed.join("\n")).toContain("Too expensive");
		expect(
			await status(decide(scope, expired, { accept: true, name: "Dee" })),
		).toBe(409);
		expect((await portal.portalQuote(scope, expired)).displayStatus).toBe(
			"expired",
		);
	});

	test("a company contact decides the company's quotes; someone who left isn't emailed", async () => {
		const acme = await contacts.createCompany(a.workspaceId, actor(), {
			name: "Acme",
			domain: "",
			phone: "",
			city: "",
			country: "",
			ownerId: "",
		});
		const eve = await contacts.createContact(
			a.workspaceId,
			actor(),
			person("Eve", "eve.quotes@example.com", acme.id),
		);
		const fin = await contacts.createContact(
			a.workspaceId,
			actor(),
			person("Fin", "fin.quotes@example.com", acme.id),
		);
		// A former salesperson: a user, but no longer a member here
		const formerId = crypto.randomUUID();
		const now = new Date();
		await db.insert(user).values({
			id: formerId,
			name: "Former",
			email: `former-${formerId.slice(0, 8)}@example.com`,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		});
		const finsQuote = await quoteFor(fin.id, {
			companyId: acme.id,
			ownerId: formerId,
		});
		const session = await sessionFor(eve.id);
		// Not a company contact yet: Fin's quote is out of reach
		expect(
			await status(portal.portalQuote(await resolve(session), finsQuote)),
		).toBe(404);
		// The same session, once staff make Eve a company contact
		await portal.setCompanyAccess(a.workspaceId, actor(), eve.id, true);
		const company = await resolve(session);
		expect(company.companyId).toBe(acme.id);
		await decide(company, finsQuote, { accept: true, name: "Eve for Acme" });
		const [row] = await db.select().from(quote).where(eq(quote.id, finsQuote));
		expect([row.status, row.decidedByContactId]).toEqual(["accepted", eve.id]);
		// The owner left and nobody sent it as a member: no email at all
		expect(printed.join("\n")).not.toContain("former-");
		await db.delete(user).where(eq(user.id, formerId));
	});
});
