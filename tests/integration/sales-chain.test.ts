import { afterAll, beforeAll, expect, test } from "bun:test";
import * as contacts from "#/modules/contacts/contacts.server";
import * as deals from "#/modules/deals/deals.server";
import * as invoices from "#/modules/invoices/invoices.server";
import * as orders from "#/modules/orders/orders.server";
import * as payments from "#/modules/payments/payments.server";
import * as pipelines from "#/modules/pipelines/pipelines.server";
import * as quotes from "#/modules/quotes/quotes.server";
import * as records from "#/modules/records/records.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Phase 2 acceptance (spec §16): deal -> quote -> order -> invoice -> partial
// payments -> paid, all on the timeline. Each step goes through the same data
// layer the pages use.
let w: Workspace;
const actor = () => ({ type: "member" as const, id: w.userId });
const sender = { name: "Tester", email: "tester@example.com" };
const today = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
	w = await createWorkspace("chain");
});
afterAll(cleanup);

test("deal -> quote -> order -> invoice -> partial payments -> paid, on the timeline", async () => {
	const ws = w.workspaceId;
	// A pipeline, a contact and a deal
	const p = await pipelines.createPipeline(ws, actor(), {
		name: { en: "Sales", es: "Ventas" },
		stages: [
			{ id: "", name: { en: "New", es: "" }, probability: 10, type: "open" },
			{ id: "", name: { en: "Won", es: "" }, probability: 100, type: "won" },
			{ id: "", name: { en: "Lost", es: "" }, probability: 0, type: "lost" },
		],
	});
	const [pipeline] = (
		await pipelines.listPipelines(ws, { includeArchived: false })
	).filter((x) => x.id === p.id);
	const [open, won] = pipeline.stages;
	const ana = await contacts.createContact(ws, actor(), {
		firstName: "Ana",
		lastName: "García",
		email: "",
		phone: "",
		jobTitle: "",
		companyId: "",
		ownerId: "",
		lifecycleStage: "lead",
		locale: "es",
		emailConsent: "unknown",
	});
	const deal = await deals.createDeal(ws, actor(), {
		name: "Website",
		pipelineId: p.id,
		stageId: open.id,
		valueCents: 121_000,
		expectedClose: "",
		contactId: ana.id,
		companyId: "",
		ownerId: "",
		lostReason: "",
	});

	// Quote from the deal: drafted, sent, accepted; the deal is won
	const quote = await quotes.createQuote(ws, actor(), { dealId: deal.id });
	await quotes.updateQuote(ws, actor(), {
		id: quote.id,
		contactId: ana.id,
		companyId: "",
		ownerId: "",
		locale: "es",
		taxRateBp: 2_100,
		validUntil: "",
		notes: "",
		lines: [
			{
				productId: "",
				description: "Design",
				sku: "",
				quantity: 1,
				unitPriceCents: 60_000,
			},
			{
				productId: "",
				description: "Build",
				sku: "",
				quantity: 1,
				unitPriceCents: 40_000,
			},
		],
	});
	await quotes.sendQuote(ws, actor(), { id: quote.id, email: false }, sender);
	await quotes.acceptQuote(ws, actor(), quote.id);
	await deals.moveDeal(ws, actor(), {
		id: deal.id,
		stageId: won.id,
		lostReason: "",
	});

	// Order from the quote, confirmed; invoice from the order, issued
	const order = await orders.createOrder(ws, actor(), { quoteId: quote.id });
	await orders.changeOrderStatus(ws, actor(), order.id, "confirm");
	const inv = await invoices.createInvoice(ws, actor(), { orderId: order.id });
	await invoices.issueInvoice(ws, actor(), inv.id);
	let { invoice: i } = await invoices.getInvoiceDetail(ws, inv.id);
	expect([i.status, i.totalCents, i.dealId]).toEqual([
		"issued",
		121_000,
		deal.id,
	]);

	// Two partial payments: the second waits for confirmation, then it's paid
	await payments.recordPayment(
		ws,
		actor(),
		{
			invoiceId: inv.id,
			amountCents: 50_000,
			paidOn: today(),
			method: "bank_transfer",
			reference: "1",
			note: "",
		},
		true,
	);
	({ invoice: i } = await invoices.getInvoiceDetail(ws, inv.id));
	expect([i.status, i.paidCents]).toEqual(["partially_paid", 50_000]);
	const second = await payments.recordPayment(
		ws,
		actor(),
		{
			invoiceId: inv.id,
			amountCents: 71_000,
			paidOn: today(),
			method: "card",
			reference: "2",
			note: "",
		},
		false,
	);
	await payments.decidePayment(ws, actor(), {
		id: second.id,
		decision: "confirm",
		reason: "",
	});
	({ invoice: i } = await invoices.getInvoiceDetail(ws, inv.id));
	expect([i.status, i.paidCents]).toEqual(["paid", 121_000]);
	expect(i.paidAt).not.toBeNull();

	// Every step is on the contact's timeline, and the deal's
	const contactTimeline = (
		await records.getTimeline(ws, "contact", ana.id)
	).events.map((e) => e.type);
	for (const type of [
		"contact.created",
		"deal.created",
		"deal.won",
		"quote.created",
		"quote.sent",
		"quote.accepted",
		"quote.ordered",
		"order.created",
		"order.confirmed",
		"order.invoiced",
		"invoice.created",
		"invoice.issued",
		"invoice.payment_confirmed",
	])
		expect(contactTimeline).toContain(type);
	// Routine edits of related records stay on their own pages
	expect(contactTimeline).not.toContain("quote.updated");

	const dealTimeline = await records.getTimeline(ws, "deal", deal.id);
	const dealTypes = dealTimeline.events.map((e) => e.type);
	for (const type of [
		"deal.won",
		"quote.accepted",
		"order.confirmed",
		"invoice.issued",
		"invoice.payment_confirmed",
	])
		expect(dealTypes).toContain(type);
	// Related events name their record
	const issued = dealTimeline.events.find((e) => e.type === "invoice.issued");
	expect([
		issued?.subjectType,
		issued?.relatedYear,
		issued?.relatedNumber,
	]).toEqual(["invoice", new Date().getUTCFullYear(), 1]);
	const accepted = dealTimeline.events.find((e) => e.type === "quote.accepted");
	expect(accepted?.relatedNumber).toBe(1);
}, 60_000);

test("another workspace's records never reach a contact's timeline", async () => {
	const other = await createWorkspace("chain-other");
	const otherActor = { type: "member" as const, id: other.userId };
	const bob = await contacts.createContact(other.workspaceId, otherActor, {
		firstName: "Bob",
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
	await quotes.createQuote(other.workspaceId, otherActor, {
		contactId: bob.id,
	});
	const mine = await contacts.createContact(w.workspaceId, actor(), {
		firstName: "Mine",
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
	const timeline = await records.getTimeline(w.workspaceId, "contact", mine.id);
	expect(timeline.events.map((e) => e.type)).toEqual(["contact.created"]);
});
