import { describe, expect, test } from "bun:test";
import {
	bpToPercent,
	centsToInput,
	computeTotals,
	invoiceNumberLabel,
	orderNumberLabel,
	parseMoneyToCents,
	parsePercentToBp,
} from "#/lib/money";

describe("parseMoneyToCents", () => {
	test("parses plain amounts into integer cents", () => {
		expect(parseMoneyToCents("0")).toBe(0);
		expect(parseMoneyToCents("12")).toBe(1200);
		expect(parseMoneyToCents("12.5")).toBe(1250);
		expect(parseMoneyToCents("12.05")).toBe(1205);
		expect(parseMoneyToCents(" 1,234.56 ")).toBe(123456);
	});

	test("never goes through floating point", () => {
		// 0.29 * 100 = 28.999999999999996 in floating point
		expect(parseMoneyToCents("0.29")).toBe(29);
		expect(parseMoneyToCents("1.15")).toBe(115);
	});

	test("rejects anything that isn't a plain amount", () => {
		for (const input of ["", "-1", "1.234", "abc", "1e3", "$5", "1.2.3"]) {
			expect(parseMoneyToCents(input)).toBeNull();
		}
	});

	test("round-trips with centsToInput", () => {
		for (const cents of [0, 5, 99, 1205, 123456]) {
			expect(parseMoneyToCents(centsToInput(cents))).toBe(cents);
		}
	});
});

describe("parsePercentToBp", () => {
	test("parses percentages into basis points", () => {
		expect(parsePercentToBp("0")).toBe(0);
		expect(parsePercentToBp("8.25")).toBe(825);
		expect(parsePercentToBp("16")).toBe(1600);
		expect(parsePercentToBp("100")).toBe(10_000);
	});

	test("rejects values above 100% or with more than 2 decimals", () => {
		for (const input of ["100.01", "101", "8.255", "-1", "", "x"]) {
			expect(parsePercentToBp(input)).toBeNull();
		}
	});

	test("round-trips with bpToPercent", () => {
		for (const bp of [0, 5, 825, 1600, 10_000]) {
			expect(parsePercentToBp(bpToPercent(bp))).toBe(bp);
		}
	});
});

describe("computeTotals", () => {
	test("multiplies lines exactly and adds tax on the subtotal", () => {
		const totals = computeTotals(
			[
				{ quantity: 3, unitPriceCents: 1999 },
				{ quantity: 1, unitPriceCents: 500 },
			],
			825,
		);
		expect(totals.lineTotals).toEqual([5997, 500]);
		expect(totals.subtotalCents).toBe(6497);
		// 6497 * 8.25% = 536.0025 -> 536
		expect(totals.taxCents).toBe(536);
		expect(totals.totalCents).toBe(7033);
	});

	test("rounds tax once, half up", () => {
		// 50 * 1% = 0.5 -> 1
		expect(
			computeTotals([{ quantity: 1, unitPriceCents: 50 }], 100).taxCents,
		).toBe(1);
		// 49 * 1% = 0.49 -> 0
		expect(
			computeTotals([{ quantity: 1, unitPriceCents: 49 }], 100).taxCents,
		).toBe(0);
	});

	test("rounding the subtotal differs from rounding each line", () => {
		// Per line: 3 x round(0.5) = 3; once on the subtotal: round(1.5) = 2
		const lines = Array.from({ length: 3 }, () => ({
			quantity: 1,
			unitPriceCents: 50,
		}));
		expect(computeTotals(lines, 100).taxCents).toBe(2);
	});

	test("an empty order totals zero", () => {
		expect(computeTotals([], 825)).toEqual({
			lineTotals: [],
			subtotalCents: 0,
			taxCents: 0,
			totalCents: 0,
		});
	});
});

describe("document number labels", () => {
	test("orders are zero-padded", () => {
		expect(orderNumberLabel(7)).toBe("ORD-0007");
		expect(orderNumberLabel(12345)).toBe("ORD-12345");
	});

	test("invoices carry the year and are Draft until issued", () => {
		expect(invoiceNumberLabel(2026, 3)).toBe("INV-2026-0003");
		expect(invoiceNumberLabel(null, null)).toBe("Draft");
		expect(invoiceNumberLabel(2026, null)).toBe("Draft");
	});
});
