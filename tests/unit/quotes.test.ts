import { describe, expect, test } from "bun:test";
import { quoteNumberLabel } from "#/lib/money";
import { quoteEmail } from "#/modules/quotes/quote-email.server";
import {
	createQuoteSchema,
	defaultValidUntil,
	displayStatus,
	QUOTE_LIMITS,
	quoteLineSchema,
	quoteTotals,
	updateQuoteSchema,
} from "#/modules/quotes/schema";

describe("displayStatus", () => {
	const now = new Date("2026-11-03T15:00:00.000Z");
	test("a sent quote expires after its valid-until day", () => {
		expect(displayStatus("sent", new Date("2026-11-03T12:00:00Z"), now)).toBe(
			"sent",
		);
		expect(displayStatus("sent", new Date("2026-11-02T12:00:00Z"), now)).toBe(
			"expired",
		);
		expect(displayStatus("sent", null, now)).toBe("sent");
	});
	test("other statuses never expire", () => {
		for (const s of ["draft", "accepted", "declined"] as const)
			expect(displayStatus(s, new Date("2020-01-01T12:00:00Z"), now)).toBe(s);
	});
});

test("the default validity is 30 days, stored at 12:00 UTC", () => {
	expect(
		defaultValidUntil(new Date("2026-11-03T23:30:00.000Z")).toISOString(),
	).toBe("2026-12-03T12:00:00.000Z");
});

test("totals: exact lines, tax rounded once, too-large totals refused", () => {
	const t = quoteTotals(
		[
			{ quantity: 3, unitPriceCents: 1_999 },
			{ quantity: 1, unitPriceCents: 5_000 },
		],
		2_100,
	);
	expect([t.subtotalCents, t.taxCents, t.totalCents]).toEqual([
		10_997, 2_309, 13_306,
	]);
	expect(t.problem).toBeNull();
	const big = quoteTotals(
		[{ quantity: QUOTE_LIMITS.maxQuantity, unitPriceCents: 1_000_000 }],
		0,
	);
	expect(big.problem).not.toBeNull();
});

describe("schemas", () => {
	const line = {
		productId: "",
		description: "Setup",
		sku: "",
		quantity: 2,
		unitPriceCents: 500,
	};
	test("lines need a description and a whole positive quantity", () => {
		expect(quoteLineSchema.safeParse(line).success).toBe(true);
		expect(
			quoteLineSchema.safeParse({ ...line, description: " " }).success,
		).toBe(false);
		expect(quoteLineSchema.safeParse({ ...line, quantity: 0 }).success).toBe(
			false,
		);
		expect(quoteLineSchema.safeParse({ ...line, quantity: 1.5 }).success).toBe(
			false,
		);
	});
	test("a new quote comes from a deal or a contact", () => {
		expect(createQuoteSchema.safeParse({}).success).toBe(false);
		expect(
			createQuoteSchema.safeParse({
				contactId: "0190a6f0-0000-7000-8000-000000000001",
			}).success,
		).toBe(true);
	});
	test("tax is 0–100 % in basis points; at most 100 lines", () => {
		const base = {
			id: "0190a6f0-0000-7000-8000-000000000001",
			contactId: "0190a6f0-0000-7000-8000-000000000002",
			companyId: "",
			ownerId: "",
			locale: "en",
			taxRateBp: 2_100,
			validUntil: "",
			notes: "",
			lines: [line],
		};
		expect(updateQuoteSchema.safeParse(base).success).toBe(true);
		expect(
			updateQuoteSchema.safeParse({ ...base, taxRateBp: 10_001 }).success,
		).toBe(false);
		expect(
			updateQuoteSchema.safeParse({
				...base,
				lines: Array.from({ length: 101 }, () => line),
			}).success,
		).toBe(false);
		expect(
			updateQuoteSchema.safeParse({ ...base, validUntil: "2024-02-31" })
				.success,
		).toBe(false);
	});
});

test("quote numbers look like QUO-0001", () => {
	expect(quoteNumberLabel(1)).toBe("QUO-0001");
	expect(quoteNumberLabel(12345)).toBe("QUO-12345");
});

test("the email is in the quote's language and escapes client text", () => {
	const email = quoteEmail({
		senderName: "Eva",
		workspaceName: "Acme <b>& Co</b>",
		contactName: "Ana",
		quote: {
			number: 7,
			locale: "es",
			currency: "EUR",
			subtotalCents: 10_000,
			taxCents: 2_100,
			totalCents: 12_100,
			taxRateBp: 2_100,
			validUntil: new Date("2026-12-03T12:00:00.000Z"),
			notes: "<script>x</script>",
		},
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
	expect(email.subject).toContain("Presupuesto QUO-0007");
	expect(email.html).toContain('lang="es"');
	expect(email.html).not.toContain("<script>");
	expect(email.html).not.toContain("<b>& Co</b>");
	expect(email.html).toContain("&lt;web&gt;");
	expect(email.text).toContain("Diseño <web>");
});
