import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event, quote } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as deals from "#/modules/deals/deals.server";
import * as pipelines from "#/modules/pipelines/pipelines.server";
import * as products from "#/modules/products/products.server";
import * as quotes from "#/modules/quotes/quotes.server";
import type { QuoteLineInput, UpdateQuoteInput } from "#/modules/quotes/schema";
import * as records from "#/modules/records/records.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Quotes: numbering, drafts and totals, the status flow and its guards,
// references, merging contacts, and workspace isolation.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });
const sender = { name: "Tester", email: "tester@example.com" };
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();

const person = (firstName: string, email = ""): ContactInput => ({
	firstName,
	lastName: "",
	email,
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "es",
	emailConsent: "unknown",
});

const freeLine = (patch: Partial<QuoteLineInput> = {}): QuoteLineInput => ({
	productId: "",
	description: "Setup",
	sku: "",
	quantity: 2,
	unitPriceCents: 5_000,
	...patch,
});

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

async function draftInput(
	workspaceId: string,
	id: string,
	patch: Partial<UpdateQuoteInput> = {},
): Promise<UpdateQuoteInput> {
	const { quote: q } = await quotes.getQuoteDetail(workspaceId, id);
	return {
		id,
		contactId: q.contactId,
		companyId: q.companyId ?? "",
		ownerId: "",
		locale: "es",
		taxRateBp: 2_100,
		validUntil: "",
		notes: "",
		lines: [freeLine()],
		...patch,
	};
}

let contactA: string;
beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("qa"), createWorkspace("qb")]);
	contactA = (
		await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Ana", `ana-${RUN}@example.com`),
		)
	).id;
});
afterAll(cleanup);

describe("quotes", () => {
	test("numbers per workspace; the language comes from the contact", async () => {
		const one = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		const two = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		expect(two.number).toBe(one.number + 1);
		const other = await contacts.createContact(
			b.workspaceId,
			actorB(),
			person("Bea"),
		);
		const first = await quotes.createQuote(b.workspaceId, actorB(), {
			contactId: other.id,
		});
		expect(first.number).toBe(1);
		const { quote: q } = await quotes.getQuoteDetail(a.workspaceId, one.id);
		expect([q.locale, q.status]).toEqual(["es", "draft"]);
	});

	test("drafts: the server computes totals; catalog lines need an active product", async () => {
		const { id } = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		const p = await products.createProduct(a.workspaceId, actorA(), {
			name: "Widget",
			sku: `W-${RUN}`,
			description: "",
			unitPriceCents: 1_999,
		});
		await quotes.updateQuote(
			a.workspaceId,
			actorA(),
			await draftInput(a.workspaceId, id, {
				lines: [
					freeLine(),
					freeLine({
						productId: p.id,
						description: "Widget",
						quantity: 3,
						unitPriceCents: 1_999,
					}),
				],
			}),
		);
		const detail = await quotes.getQuoteDetail(a.workspaceId, id);
		expect(detail.lines.map((l) => l.lineTotalCents)).toEqual([10_000, 5_997]);
		expect([
			detail.quote.subtotalCents,
			detail.quote.taxCents,
			detail.quote.totalCents,
		]).toEqual([15_997, 3_359, 19_356]);

		// A product archived since stays on the draft; a newly added one must be active
		const old = await products.createProduct(a.workspaceId, actorA(), {
			name: "Old",
			sku: `O-${RUN}`,
			description: "",
			unitPriceCents: 100,
		});
		await products.setProductArchived(a.workspaceId, actorA(), old.id, true);
		expect(
			await status(
				quotes.updateQuote(
					a.workspaceId,
					actorA(),
					await draftInput(a.workspaceId, id, {
						lines: [freeLine({ productId: old.id })],
					}),
				),
			),
		).toBe(400);
		await products.setProductArchived(a.workspaceId, actorA(), p.id, true);
		await quotes.updateQuote(
			a.workspaceId,
			actorA(),
			await draftInput(a.workspaceId, id, {
				lines: [freeLine({ productId: p.id })],
			}),
		);
	});

	test("send, accept, decline, reopen: only from the right status, once", async () => {
		const { id } = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		// Nothing to send yet
		expect(
			await status(
				quotes.sendQuote(a.workspaceId, actorA(), { id, email: false }, sender),
			),
		).toBe(400);
		await quotes.updateQuote(
			a.workspaceId,
			actorA(),
			await draftInput(a.workspaceId, id),
		);
		expect(await status(quotes.acceptQuote(a.workspaceId, actorA(), id))).toBe(
			409,
		);
		await quotes.sendQuote(
			a.workspaceId,
			actorA(),
			{ id, email: false },
			sender,
		);
		let { quote: q } = await quotes.getQuoteDetail(a.workspaceId, id);
		expect(q.status).toBe("sent");
		// 30 days by default
		expect(q.validUntil).not.toBeNull();
		// A sent quote can't be edited
		expect(
			await status(
				quotes.updateQuote(
					a.workspaceId,
					actorA(),
					await draftInput(a.workspaceId, id),
				),
			),
		).toBe(409);

		await quotes.reopenQuote(a.workspaceId, actorA(), id);
		await quotes.sendQuote(
			a.workspaceId,
			actorA(),
			{ id, email: false },
			sender,
		);
		const results = await Promise.all([
			status(quotes.acceptQuote(a.workspaceId, actorA(), id)),
			status(quotes.acceptQuote(a.workspaceId, actorA(), id)),
		]);
		expect(results.sort()).toEqual([200, 409]);
		({ quote: q } = await quotes.getQuoteDetail(a.workspaceId, id));
		expect(q.status).toBe("accepted");
		expect(
			await status(
				quotes.declineQuote(a.workspaceId, actorA(), { id, reason: "" }),
			),
		).toBe(409);
		expect(await status(quotes.reopenQuote(a.workspaceId, actorA(), id))).toBe(
			409,
		);

		const types = (
			await db
				.select({ type: event.type })
				.from(event)
				.where(and(eq(event.subjectType, "quote"), eq(event.subjectId, id)))
		).map((e) => e.type);
		expect(types.filter((t) => t === "quote.accepted")).toHaveLength(1);
		expect(types.filter((t) => t === "quote.sent")).toHaveLength(2);
	});

	test("expired quotes can't be accepted; emailing needs the contact's address", async () => {
		const noEmail = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Nomail"),
		);
		const { id } = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: noEmail.id,
		});
		await quotes.updateQuote(
			a.workspaceId,
			actorA(),
			await draftInput(a.workspaceId, id),
		);
		expect(
			await status(
				quotes.sendQuote(a.workspaceId, actorA(), { id, email: true }, sender),
			),
		).toBe(400);
		await quotes.sendQuote(
			a.workspaceId,
			actorA(),
			{ id, email: false },
			sender,
		);
		// Make it expired
		await db
			.update(quote)
			.set({ validUntil: new Date("2020-01-01T12:00:00.000Z") })
			.where(eq(quote.id, id));
		const { quote: q } = await quotes.getQuoteDetail(a.workspaceId, id);
		expect(q.displayStatus).toBe("expired");
		expect(await status(quotes.acceptQuote(a.workspaceId, actorA(), id))).toBe(
			409,
		);
		await quotes.declineQuote(a.workspaceId, actorA(), {
			id,
			reason: "Too late",
		});
		const { quote: after } = await quotes.getQuoteDetail(a.workspaceId, id);
		expect([after.status, after.declineReason]).toEqual([
			"declined",
			"Too late",
		]);
	});

	test("quote emails are capped per quote", async () => {
		const { id } = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		await quotes.updateQuote(
			a.workspaceId,
			actorA(),
			await draftInput(a.workspaceId, id),
		);
		// Five earlier emails of this quote, as the event log records them
		await db.insert(event).values(
			Array.from({ length: 5 }, () => ({
				id: crypto.randomUUID(),
				workspaceId: a.workspaceId,
				type: "quote.sent",
				subjectType: "quote",
				subjectId: id,
				actorType: "member",
				actorId: a.userId,
				payload: { email: true },
			})),
		);
		expect(
			await status(
				quotes.sendQuote(a.workspaceId, actorA(), { id, email: true }, sender),
			),
		).toBe(429);
		// Marking it as sent (no email) is still possible
		await quotes.sendQuote(
			a.workspaceId,
			actorA(),
			{ id, email: false },
			sender,
		);
	});

	test("from a deal: contact and company come along; accepting returns the deal", async () => {
		const p = await pipelines.createPipeline(a.workspaceId, actorA(), {
			name: { en: `Q ${RUN}`, es: "" },
			stages: [
				{ id: "", name: { en: "New", es: "" }, probability: 10, type: "open" },
				{ id: "", name: { en: "Won", es: "" }, probability: 100, type: "won" },
				{ id: "", name: { en: "Lost", es: "" }, probability: 0, type: "lost" },
			],
		});
		const [found] = (
			await pipelines.listPipelines(a.workspaceId, { includeArchived: false })
		).filter((x) => x.id === p.id);
		const d = await deals.createDeal(a.workspaceId, actorA(), {
			name: "Site",
			pipelineId: p.id,
			stageId: found.stages[0].id,
			valueCents: 0,
			expectedClose: "",
			contactId: contactA,
			companyId: "",
			ownerId: "",
			lostReason: "",
		});
		const { id } = await quotes.createQuote(a.workspaceId, actorA(), {
			dealId: d.id,
		});
		const detail = await quotes.getQuoteDetail(a.workspaceId, id);
		expect([detail.quote.dealId, detail.quote.contactId]).toEqual([
			d.id,
			contactA,
		]);
		await quotes.updateQuote(
			a.workspaceId,
			actorA(),
			await draftInput(a.workspaceId, id),
		);
		await quotes.sendQuote(
			a.workspaceId,
			actorA(),
			{ id, email: false },
			sender,
		);
		const accepted = await quotes.acceptQuote(a.workspaceId, actorA(), id);
		expect(accepted.dealId).toBe(d.id);
		const related = await quotes.relatedQuotes(a.workspaceId, { dealId: d.id });
		expect(related.map((r) => r.id)).toEqual([id]);
	});

	test("merging contacts moves their quotes; tags and notes work on quotes", async () => {
		const keep = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Keep"),
		);
		const dup = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Dup"),
		);
		const { id } = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: dup.id,
		});
		await records.addTag(a.workspaceId, actorA(), {
			subjectType: "quote",
			subjectId: id,
			name: "big",
		});
		await records.createNote(a.workspaceId, actorA(), {
			subjectType: "quote",
			subjectId: id,
			body: "Call",
		});
		await contacts.mergeContacts(a.workspaceId, actorA(), {
			keepId: keep.id,
			duplicateId: dup.id,
			choices: {},
		});
		const { quote: q } = await quotes.getQuoteDetail(a.workspaceId, id);
		expect(q.contactId).toBe(keep.id);
		const timeline = await records.getTimeline(a.workspaceId, "quote", id);
		expect(timeline.tags.map((t) => t.name)).toEqual(["big"]);
	});

	test("never reaches across workspaces", async () => {
		const { id } = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		expect(await status(quotes.getQuoteDetail(b.workspaceId, id))).toBe(404);
		expect(
			await status(
				quotes.updateQuote(
					b.workspaceId,
					actorB(),
					await draftInput(a.workspaceId, id),
				),
			),
		).toBe(404);
		expect(
			await status(
				quotes.sendQuote(b.workspaceId, actorB(), { id, email: false }, sender),
			),
		).toBe(404);
		expect(
			await status(quotes.setQuoteArchived(b.workspaceId, actorB(), id, true)),
		).toBe(404);
		// B can't quote A's contact, or put A's product on its own draft
		expect(
			await status(
				quotes.createQuote(b.workspaceId, actorB(), { contactId: contactA }),
			),
		).toBe(400);
		const bContact = await contacts.createContact(
			b.workspaceId,
			actorB(),
			person("Bob"),
		);
		const bQuote = await quotes.createQuote(b.workspaceId, actorB(), {
			contactId: bContact.id,
		});
		const aProduct = await products.createProduct(a.workspaceId, actorA(), {
			name: "Mine",
			sku: `M-${RUN}`,
			description: "",
			unitPriceCents: 100,
		});
		expect(
			await status(
				quotes.updateQuote(
					b.workspaceId,
					actorB(),
					await draftInput(b.workspaceId, bQuote.id, {
						lines: [freeLine({ productId: aProduct.id })],
					}),
				),
			),
		).toBe(400);
		expect(
			await status(
				quotes.updateQuote(
					b.workspaceId,
					actorB(),
					await draftInput(b.workspaceId, bQuote.id, { contactId: contactA }),
				),
			),
		).toBe(400);
	});
});
