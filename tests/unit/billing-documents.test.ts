import { describe, expect, test } from "bun:test";
import { documentEmail } from "#/modules/documents/document-email.server";
import {
	DOCUMENT_LIMITS,
	documentLineSchema,
	documentTotals,
	optionalDaySchema,
} from "#/modules/documents/lines";
import {
	createInvoiceSchema,
	invoiceDisplayStatus,
	invoiceLabel,
} from "#/modules/invoices/schema";
import {
	createOrderSchema,
	ORDER_TRANSITIONS,
	updateOrderSchema,
} from "#/modules/orders/schema";

describe("shared document lines", () => {
	test("totals are exact per line, tax rounded once, too-large refused", () => {
		const t = documentTotals(
			[
				{ quantity: 3, unitPriceCents: 1_999 },
				{ quantity: 1, unitPriceCents: 5_000 },
			],
			2_100,
		);
		expect([t.subtotalCents, t.taxCents, t.totalCents]).toEqual([
			10_997, 2_309, 13_306,
		]);
		expect(
			documentTotals(
				[{ quantity: DOCUMENT_LIMITS.maxQuantity, unitPriceCents: 1_000_000 }],
				0,
			).problem,
		).not.toBeNull();
	});
	test("a line needs a description and a whole quantity of at least 1", () => {
		const line = {
			productId: "",
			description: "Hours",
			sku: "",
			quantity: 1,
			unitPriceCents: 0,
		};
		expect(documentLineSchema.safeParse(line).success).toBe(true);
		expect(documentLineSchema.safeParse({ ...line, quantity: 0 }).success).toBe(
			false,
		);
		expect(
			documentLineSchema.safeParse({ ...line, description: "" }).success,
		).toBe(false);
	});
	test("days must exist", () => {
		expect(optionalDaySchema.safeParse("2024-02-29").success).toBe(true);
		expect(optionalDaySchema.safeParse("2023-02-29").success).toBe(false);
		expect(optionalDaySchema.safeParse("").success).toBe(true);
	});
});

describe("orders", () => {
	test("status changes start only from the right status", () => {
		expect(ORDER_TRANSITIONS.confirm).toEqual({
			from: ["draft"],
			to: "confirmed",
		});
		expect(ORDER_TRANSITIONS.fulfil.from).toEqual(["confirmed"]);
		expect(ORDER_TRANSITIONS.cancel.from).toEqual(["draft", "confirmed"]);
		expect(ORDER_TRANSITIONS.reopen).toEqual({
			from: ["confirmed"],
			to: "draft",
		});
	});
	test("a new order comes from a contact, a deal or a quote", () => {
		expect(createOrderSchema.safeParse({}).success).toBe(false);
		expect(
			createOrderSchema.safeParse({
				quoteId: "0190a6f0-0000-7000-8000-000000000001",
			}).success,
		).toBe(true);
	});
	test("drafts: tax 0–100 %, a real order date", () => {
		const base = {
			id: "0190a6f0-0000-7000-8000-000000000001",
			contactId: "0190a6f0-0000-7000-8000-000000000002",
			companyId: "",
			ownerId: "",
			locale: "es",
			taxRateBp: 0,
			orderDate: "2026-11-03",
			notes: "",
			lines: [],
		};
		expect(updateOrderSchema.safeParse(base).success).toBe(true);
		expect(
			updateOrderSchema.safeParse({ ...base, taxRateBp: 10_001 }).success,
		).toBe(false);
		expect(
			updateOrderSchema.safeParse({ ...base, orderDate: "2026-02-30" }).success,
		).toBe(false);
	});
});

describe("invoices", () => {
	test("numbers read INV-2026-0001; drafts have none", () => {
		expect(invoiceLabel(2026, 1)).toBe("INV-2026-0001");
		expect(invoiceLabel(2026, 12345)).toBe("INV-2026-12345");
		expect(invoiceLabel(null, null)).toBe("");
	});
	test("an issued invoice past its due day is overdue", () => {
		const now = new Date("2026-11-03T15:00:00.000Z");
		expect(
			invoiceDisplayStatus("issued", new Date("2026-11-03T12:00:00Z"), now),
		).toBe("issued");
		expect(
			invoiceDisplayStatus("issued", new Date("2026-11-02T12:00:00Z"), now),
		).toBe("overdue");
		expect(
			invoiceDisplayStatus("void", new Date("2020-01-01T12:00:00Z"), now),
		).toBe("void");
	});
	test("a new invoice comes from a contact, a deal or an order", () => {
		expect(createInvoiceSchema.safeParse({}).success).toBe(false);
		expect(
			createInvoiceSchema.safeParse({
				orderId: "0190a6f0-0000-7000-8000-000000000001",
			}).success,
		).toBe(true);
	});
});

test("the document email is in its language and escapes every value", () => {
	const email = documentEmail({
		locale: "es",
		title: "Factura INV-2026-0001",
		subject: "Factura INV-2026-0001 de <Acme>",
		intro: "Hola <b>Ana</b>",
		workspaceName: "Acme & <Co>",
		after: ["Vence: 3/12/2026"],
		closing: "Eva",
		currency: "EUR",
		taxRateBp: 2_100,
		subtotalCents: 10_000,
		taxCents: 2_100,
		totalCents: 12_100,
		notes: "<script>x</script>",
		lines: [
			{
				description: "Diseño <web>",
				sku: null,
				quantity: 1,
				unitPriceCents: 10_000,
				lineTotalCents: 10_000,
			},
		],
	});
	expect(email.html).toContain('lang="es"');
	expect(email.html).not.toContain("<script>");
	expect(email.html).not.toContain("<b>Ana</b>");
	expect(email.html).toContain("Acme &amp; &lt;Co&gt;");
	expect(email.text).toContain("Diseño <web>");
});
