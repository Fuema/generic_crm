import { expect, test } from "bun:test";
import { invoiceDisplayStatus } from "#/modules/invoices/schema";
import { paidStatus, recordPaymentSchema } from "#/modules/payments/schema";

const valid = {
	invoiceId: "0190a6f0-0000-7000-8000-000000000001",
	amountCents: 4_990,
	paidOn: "2026-11-01",
	method: "bank_transfer",
	reference: "TR-123",
	note: "",
};

test("an invoice is issued, partially paid or paid by its confirmed sum", () => {
	expect(paidStatus(10_000, 0)).toBe("issued");
	expect(paidStatus(10_000, 1)).toBe("partially_paid");
	expect(paidStatus(10_000, 10_000)).toBe("paid");
});

test("payments need a positive whole amount, a known method and a past day", () => {
	expect(recordPaymentSchema.safeParse(valid).success).toBe(true);
	expect(
		recordPaymentSchema.safeParse({ ...valid, amountCents: 0 }).success,
	).toBe(false);
	expect(
		recordPaymentSchema.safeParse({ ...valid, amountCents: 1.5 }).success,
	).toBe(false);
	expect(
		recordPaymentSchema.safeParse({ ...valid, method: "crypto" }).success,
	).toBe(false);
	expect(
		recordPaymentSchema.safeParse({ ...valid, paidOn: "2999-01-01" }).success,
	).toBe(false);
	expect(
		recordPaymentSchema.safeParse({ ...valid, paidOn: "2026-02-30" }).success,
	).toBe(false);
});

test("a partially paid invoice past its due day is overdue; a paid one never", () => {
	const now = new Date("2026-11-03T15:00:00.000Z");
	const past = new Date("2026-10-01T12:00:00.000Z");
	expect(invoiceDisplayStatus("partially_paid", past, now)).toBe("overdue");
	expect(invoiceDisplayStatus("paid", past, now)).toBe("paid");
});
