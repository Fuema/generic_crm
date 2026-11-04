import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as invoices from "#/modules/invoices/invoices.server";
import * as orders from "#/modules/orders/orders.server";
import * as payments from "#/modules/payments/payments.server";
import type { RecordPaymentInput } from "#/modules/payments/schema";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Payments (phase 2 step 6): confirmed at once or waiting, partial and full
// payment, overpayment refused, reversing, void refused with payments, drafts
// of an order locked to it, and workspace isolation.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });

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

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

const pay = (invoiceId: string, amountCents: number): RecordPaymentInput => ({
	invoiceId,
	amountCents,
	paidOn: new Date().toISOString().slice(0, 10),
	method: "bank_transfer",
	reference: "",
	note: "",
});

// An issued invoice of 100.00 (no tax)
async function issued(
	w: Workspace,
	actor: ReturnType<typeof actorA>,
	contactId: string,
) {
	const { id } = await invoices.createInvoice(w.workspaceId, actor, {
		contactId,
	});
	await invoices.updateInvoice(w.workspaceId, actor, {
		id,
		contactId,
		companyId: "",
		ownerId: "",
		locale: "en",
		taxRateBp: 0,
		notes: "",
		lines: [
			{
				productId: "",
				description: "Work",
				sku: "",
				quantity: 1,
				unitPriceCents: 10_000,
			},
		],
	});
	await invoices.issueInvoice(w.workspaceId, actor, id);
	return id;
}

const state = async (w: Workspace, id: string) => {
	const { invoice: i } = await invoices.getInvoiceDetail(w.workspaceId, id);
	return [i.status, i.paidCents];
};

let contactA: string;
beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("pya"), createWorkspace("pyb")]);
	contactA = (
		await contacts.createContact(a.workspaceId, actorA(), person("Ana"))
	).id;
});
afterAll(cleanup);

describe("payments", () => {
	test("partial then full; waiting payments count only once confirmed", async () => {
		const id = await issued(a, actorA(), contactA);
		// Not on a draft
		const draft = await invoices.createInvoice(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		expect(
			await status(
				payments.recordPayment(
					a.workspaceId,
					actorA(),
					pay(draft.id, 100),
					true,
				),
			),
		).toBe(409);

		await payments.recordPayment(a.workspaceId, actorA(), pay(id, 4_000), true);
		expect(await state(a, id)).toEqual(["partially_paid", 4_000]);
		// An editor's payment waits
		const waiting = await payments.recordPayment(
			a.workspaceId,
			actorA(),
			pay(id, 6_000),
			false,
		);
		expect(await state(a, id)).toEqual(["partially_paid", 4_000]);
		// Pending plus confirmed can't exceed the total
		expect(
			await status(
				payments.recordPayment(a.workspaceId, actorA(), pay(id, 1), true),
			),
		).toBe(400);
		await payments.decidePayment(a.workspaceId, actorA(), {
			id: waiting.id,
			decision: "confirm",
			reason: "",
		});
		expect(await state(a, id)).toEqual(["paid", 10_000]);
		// Void is refused while payments count
		expect(
			await status(invoices.voidInvoice(a.workspaceId, actorA(), id)),
		).toBe(409);
		// Reversing a confirmed payment
		await payments.decidePayment(a.workspaceId, actorA(), {
			id: waiting.id,
			decision: "reject",
			reason: "Bounced",
		});
		expect(await state(a, id)).toEqual(["partially_paid", 4_000]);
		expect(
			await status(
				payments.decidePayment(a.workspaceId, actorA(), {
					id: waiting.id,
					decision: "confirm",
					reason: "",
				}),
			),
		).toBe(409);
		const types = (
			await db
				.select({ type: event.type })
				.from(event)
				.where(and(eq(event.subjectType, "invoice"), eq(event.subjectId, id)))
		).map((e) => e.type);
		expect(
			types.filter((t) => t.startsWith("invoice.payment_")).sort(),
		).toEqual([
			"invoice.payment_confirmed",
			"invoice.payment_confirmed",
			"invoice.payment_recorded",
			"invoice.payment_rejected",
		]);
	});

	test("two payments at once can't together exceed the total", async () => {
		const id = await issued(a, actorA(), contactA);
		const results = await Promise.all([
			status(
				payments.recordPayment(a.workspaceId, actorA(), pay(id, 6_000), true),
			),
			status(
				payments.recordPayment(a.workspaceId, actorA(), pay(id, 6_000), true),
			),
		]);
		expect(results.filter((r) => r === 200)).toHaveLength(1);
		expect(await state(a, id)).toEqual(["partially_paid", 6_000]);
	});

	test("a draft from an order keeps the order's contact, lines and tax", async () => {
		const o = await orders.createOrder(a.workspaceId, actorA(), {
			contactId: contactA,
		});
		await orders.updateOrder(a.workspaceId, actorA(), {
			id: o.id,
			contactId: contactA,
			companyId: "",
			ownerId: "",
			locale: "en",
			taxRateBp: 1_000,
			orderDate: "",
			notes: "",
			lines: [
				{
					productId: "",
					description: "Order line",
					sku: "",
					quantity: 1,
					unitPriceCents: 500,
				},
			],
		});
		await orders.changeOrderStatus(a.workspaceId, actorA(), o.id, "confirm");
		const inv = await invoices.createInvoice(a.workspaceId, actorA(), {
			orderId: o.id,
		});
		const other = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Other"),
		);
		await invoices.updateInvoice(a.workspaceId, actorA(), {
			id: inv.id,
			contactId: other.id,
			companyId: "",
			ownerId: "",
			locale: "es",
			taxRateBp: 0,
			notes: "Changed",
			lines: [],
		});
		const detail = await invoices.getInvoiceDetail(a.workspaceId, inv.id);
		expect([
			detail.invoice.contactId,
			detail.invoice.taxRateBp,
			detail.lines.length,
		]).toEqual([contactA, 1_000, 1]);
		expect([detail.invoice.locale, detail.invoice.notes]).toEqual([
			"es",
			"Changed",
		]);
		// It can't be archived (void it instead)
		expect(
			await status(
				invoices.setInvoiceArchived(a.workspaceId, actorA(), inv.id, true),
			),
		).toBe(409);
	});

	test("never reaches across workspaces", async () => {
		const id = await issued(a, actorA(), contactA);
		const p = await payments.recordPayment(
			a.workspaceId,
			actorA(),
			pay(id, 100),
			false,
		);
		expect(
			await status(
				payments.recordPayment(b.workspaceId, actorB(), pay(id, 100), true),
			),
		).toBe(404);
		expect(
			await status(
				payments.decidePayment(b.workspaceId, actorB(), {
					id: p.id,
					decision: "confirm",
					reason: "",
				}),
			),
		).toBe(404);
		expect(await status(payments.listPayments(b.workspaceId, id))).toBe(404);
		expect(await state(a, id)).toEqual(["issued", 0]);
	});
});
