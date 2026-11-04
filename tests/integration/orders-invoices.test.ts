import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event, invoice } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import type { DocumentLineInput } from "#/modules/documents/lines";
import * as invoices from "#/modules/invoices/invoices.server";
import * as orders from "#/modules/orders/orders.server";
import * as quotes from "#/modules/quotes/quotes.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Orders and invoices on contacts (phase 2 step 5): from a quote and direct,
// the status rules, one invoice per order, numbering on issue, merging and
// workspace isolation.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });
const sender = { name: "Tester", email: "tester@example.com" };

const person = (firstName: string): ContactInput => ({
	firstName,
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "en",
	emailConsent: "unknown",
});

const line = (patch: Partial<DocumentLineInput> = {}): DocumentLineInput => ({
	productId: "",
	description: "Work",
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

async function saveOrder(
	workspaceId: string,
	actor: ReturnType<typeof actorA>,
	id: string,
	lines = [line()],
) {
	const { order: o } = await orders.getOrderDetail(workspaceId, id);
	await orders.updateOrder(workspaceId, actor, {
		id,
		contactId: o.contactId,
		companyId: "",
		ownerId: "",
		locale: "en",
		taxRateBp: 1_000,
		orderDate: "",
		notes: "",
		lines,
	});
}

async function saveInvoice(
	workspaceId: string,
	actor: ReturnType<typeof actorA>,
	id: string,
	lines = [line()],
) {
	const { invoice: i } = await invoices.getInvoiceDetail(workspaceId, id);
	await invoices.updateInvoice(workspaceId, actor, {
		id,
		contactId: i.contactId,
		companyId: "",
		ownerId: "",
		locale: "en",
		taxRateBp: 1_000,
		notes: "",
		lines,
	});
}

let contactA: string;
beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("oa"), createWorkspace("ob")]);
	contactA = (
		await contacts.createContact(a.workspaceId, actorA(), person("Ana"))
	).id;
});
afterAll(cleanup);

describe("orders", () => {
	test("from an accepted quote: lines copied, once per quote", async () => {
		const q = await quotes.createQuote(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		const { quote: qd } = await quotes.getQuoteDetail(a.workspaceId, q.id);
		await quotes.updateQuote(a.workspaceId, actorA(), {
			id: q.id,
			contactId: qd.contactId,
			companyId: "",
			ownerId: "",
			locale: "es",
			taxRateBp: 2_100,
			validUntil: "",
			notes: "Thanks",
			lines: [
				line(),
				line({ description: "Extra", quantity: 1, unitPriceCents: 999 }),
			],
		});
		// Not accepted yet
		expect(
			await status(
				orders.createOrder(a.workspaceId, actorA(), { quoteId: q.id }),
			),
		).toBe(409);
		await quotes.sendQuote(
			a.workspaceId,
			actorA(),
			{ id: q.id, email: false },
			sender,
		);
		await quotes.acceptQuote(a.workspaceId, actorA(), q.id);
		const results = await Promise.all([
			status(orders.createOrder(a.workspaceId, actorA(), { quoteId: q.id })),
			status(orders.createOrder(a.workspaceId, actorA(), { quoteId: q.id })),
		]);
		expect(results.sort()).toEqual([200, 409]);
		const [o] = await orders.relatedOrders(a.workspaceId, { quoteId: q.id });
		const detail = await orders.getOrderDetail(a.workspaceId, o.id);
		expect(detail.lines.map((l) => l.description)).toEqual(["Work", "Extra"]);
		expect([
			detail.order.locale,
			detail.order.taxRateBp,
			detail.order.totalCents,
		]).toEqual(["es", 2_100, 13_309]);
	});

	test("draft -> confirmed -> fulfilled; cancel and reopen are refused once invoiced", async () => {
		const { id } = await orders.createOrder(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		expect(
			await status(
				orders.changeOrderStatus(a.workspaceId, actorA(), id, "confirm"),
			),
		).toBe(400);
		await saveOrder(a.workspaceId, actorA(), id);
		await orders.changeOrderStatus(a.workspaceId, actorA(), id, "confirm");
		// A confirmed order can't be edited
		expect(await status(saveOrder(a.workspaceId, actorA(), id))).toBe(409);
		expect(
			await status(
				orders.changeOrderStatus(a.workspaceId, actorA(), id, "confirm"),
			),
		).toBe(409);
		const inv = await invoices.createInvoice(a.workspaceId, actorA(), {
			orderId: id,
		});
		expect(
			await status(
				orders.changeOrderStatus(a.workspaceId, actorA(), id, "cancel"),
			),
		).toBe(409);
		expect(
			await status(
				orders.changeOrderStatus(a.workspaceId, actorA(), id, "reopen"),
			),
		).toBe(409);
		await orders.changeOrderStatus(a.workspaceId, actorA(), id, "fulfil");
		// One invoice per order; voiding frees it
		expect(
			await status(
				invoices.createInvoice(a.workspaceId, actorA(), { orderId: id }),
			),
		).toBe(409);
		await invoices.voidInvoice(a.workspaceId, actorA(), inv.id);
		const again = await invoices.createInvoice(a.workspaceId, actorA(), {
			orderId: id,
		});
		const detail = await invoices.getInvoiceDetail(a.workspaceId, again.id);
		expect(detail.lines).toHaveLength(1);
		expect(detail.invoice.totalCents).toBe(11_000);
	});
});

describe("invoices", () => {
	test("direct drafts; issued in this year's series, due after the terms, then frozen", async () => {
		const { id } = await invoices.createInvoice(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		expect(
			await status(invoices.issueInvoice(a.workspaceId, actorA(), id)),
		).toBe(400);
		await saveInvoice(a.workspaceId, actorA(), id);
		const first = await invoices.issueInvoice(a.workspaceId, actorA(), id);
		expect(first.year).toBe(new Date().getUTCFullYear());
		const { invoice: issued } = await invoices.getInvoiceDetail(
			a.workspaceId,
			id,
		);
		expect(issued.status).toBe("issued");
		const days = Math.round(
			((issued.dueDate as Date).getTime() -
				(issued.issueDate as Date).getTime()) /
				86_400_000,
		);
		expect(days).toBe(30);
		expect(await status(saveInvoice(a.workspaceId, actorA(), id))).toBe(409);
		expect(
			await status(invoices.issueInvoice(a.workspaceId, actorA(), id)),
		).toBe(409);
		// An issued invoice can't be archived, only voided
		expect(
			await status(
				invoices.setInvoiceArchived(a.workspaceId, actorA(), id, true),
			),
		).toBe(409);

		const second = await invoices.createInvoice(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		await saveInvoice(a.workspaceId, actorA(), second.id);
		const next = await invoices.issueInvoice(
			a.workspaceId,
			actorA(),
			second.id,
		);
		expect(next.number).toBe(first.number + 1);
	});

	test("issuing twice at once or in parallel leaves no gap in the numbers", async () => {
		const c = await createWorkspace("oc");
		const actor = { type: "member" as const, id: c.userId };
		const who = await contacts.createContact(
			c.workspaceId,
			actor,
			person("Num"),
		);
		const draft = async () => {
			const { id } = await invoices.createInvoice(c.workspaceId, actor, {
				contactId: who.id,
			});
			await saveInvoice(c.workspaceId, actor, id);
			return id;
		};
		// A double click on Issue: one wins, the other is refused
		const one = await draft();
		const clicks = await Promise.all([
			status(invoices.issueInvoice(c.workspaceId, actor, one)),
			status(invoices.issueInvoice(c.workspaceId, actor, one)),
		]);
		expect(clicks.sort()).toEqual([200, 409]);
		// Two invoices issued at the same moment, then one more
		const [two, three] = await Promise.all([draft(), draft()]);
		await Promise.all([
			invoices.issueInvoice(c.workspaceId, actor, two),
			invoices.issueInvoice(c.workspaceId, actor, three),
		]);
		const four = await draft();
		await invoices.issueInvoice(c.workspaceId, actor, four);
		const numbers = (
			await Promise.all(
				[one, two, three, four].map((id) =>
					invoices.getInvoiceDetail(c.workspaceId, id),
				),
			)
		)
			.map((d) => d.invoice.number as number)
			.sort((x, y) => x - y);
		expect(numbers).toEqual([1, 2, 3, 4]);
	});

	test("emailing needs an issued invoice and the contact's address", async () => {
		const { id } = await invoices.createInvoice(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		expect(
			await status(invoices.sendInvoice(a.workspaceId, actorA(), id, sender)),
		).toBe(409);
		await saveInvoice(a.workspaceId, actorA(), id);
		await invoices.issueInvoice(a.workspaceId, actorA(), id);
		expect(
			await status(invoices.sendInvoice(a.workspaceId, actorA(), id, sender)),
		).toBe(400);
	});

	test("merging contacts moves orders and invoices", async () => {
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
		const o = await orders.createOrder(a.workspaceId, actorA(), {
			contactId: dup.id,
		});
		const i = await invoices.createInvoice(a.workspaceId, actorA(), {
			contactId: dup.id,
		});
		await contacts.mergeContacts(a.workspaceId, actorA(), {
			keepId: keep.id,
			duplicateId: dup.id,
			choices: {},
		});
		const { order: od } = await orders.getOrderDetail(a.workspaceId, o.id);
		const { invoice: idt } = await invoices.getInvoiceDetail(
			a.workspaceId,
			i.id,
		);
		expect([od.contactId, idt.contactId]).toEqual([keep.id, keep.id]);
	});

	test("never reaches across workspaces", async () => {
		const o = await orders.createOrder(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		const i = await invoices.createInvoice(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		expect(await status(orders.getOrderDetail(b.workspaceId, o.id))).toBe(404);
		expect(await status(invoices.getInvoiceDetail(b.workspaceId, i.id))).toBe(
			404,
		);
		expect(
			await status(
				orders.changeOrderStatus(b.workspaceId, actorB(), o.id, "cancel"),
			),
		).toBe(404);
		expect(
			await status(invoices.voidInvoice(b.workspaceId, actorB(), i.id)),
		).toBe(404);
		expect(
			await status(
				invoices.createInvoice(b.workspaceId, actorB(), { orderId: o.id }),
			),
		).toBe(404);
		expect(
			await status(
				orders.createOrder(b.workspaceId, actorB(), { contactId: contactA }),
			),
		).toBe(400);
		expect(
			await status(
				invoices.createInvoice(b.workspaceId, actorB(), {
					contactId: contactA,
				}),
			),
		).toBe(400);
		const bContact = await contacts.createContact(
			b.workspaceId,
			actorB(),
			person("Bob"),
		);
		const bInvoice = await invoices.createInvoice(b.workspaceId, actorB(), {
			contactId: bContact.id,
		});
		// B can't move its draft to A's contact or put A's product on it
		const { invoice: bi } = await invoices.getInvoiceDetail(
			b.workspaceId,
			bInvoice.id,
		);
		expect(
			await status(
				invoices.updateInvoice(b.workspaceId, actorB(), {
					id: bi.id,
					contactId: contactA,
					companyId: "",
					ownerId: "",
					locale: "en",
					taxRateBp: 0,
					notes: "",
					lines: [],
				}),
			),
		).toBe(400);
		expect(
			await status(
				saveInvoice(b.workspaceId, actorB(), bi.id, [
					line({ productId: a.productId }),
				]),
			),
		).toBe(400);
		const events = await db
			.select({ id: event.id })
			.from(event)
			.where(
				and(eq(event.workspaceId, b.workspaceId), eq(event.subjectId, i.id)),
			);
		expect(events).toEqual([]);
		const rows = await db
			.select({ id: invoice.id })
			.from(invoice)
			.where(eq(invoice.id, i.id));
		expect(rows).toHaveLength(1);
	});
});
