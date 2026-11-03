import { getLocale } from "#/paraglide/runtime.js";

// Money is handled as integer cents everywhere; only formatting and parsing
// touch decimals. Tax rates are basis points: 825 = 8.25%.

export const CURRENCIES = [
	"USD",
	"EUR",
	"GBP",
	"CAD",
	"MXN",
	"BRL",
	"ARS",
	"AUD",
	"JPY",
	"INR",
	"CHF",
	"SEK",
] as const;
export type Currency = (typeof CURRENCIES)[number];

// In the reader's language (spec §14), with the workspace's currency
export function formatMoney(
	cents: number,
	currency: string,
	locale: string = getLocale(),
) {
	try {
		return new Intl.NumberFormat(locale, {
			style: "currency",
			currency,
		}).format(cents / 100);
	} catch {
		return `${(cents / 100).toFixed(2)} ${currency}`;
	}
}

// "1,234.5" -> 123450. Returns null for anything that isn't a plain amount.
export function parseMoneyToCents(input: string) {
	const cleaned = input.trim().replace(/,/g, "");
	if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;
	const [whole, fraction = ""] = cleaned.split(".");
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToInput(cents: number) {
	return (cents / 100).toFixed(2);
}

// "8.25" -> 825. Returns null outside 0-100% or with more than 2 decimals.
export function parsePercentToBp(input: string) {
	const cleaned = input.trim();
	if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
	const [whole, fraction = ""] = cleaned.split(".");
	const bp = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
	return bp <= 10_000 ? bp : null;
}

export function bpToPercent(bp: number) {
	return (bp / 100).toString();
}

// Line totals are exact; tax is rounded once on the subtotal (half up)
export function computeTotals(
	lines: { quantity: number; unitPriceCents: number }[],
	taxRateBp: number,
) {
	const lineTotals = lines.map((l) => l.quantity * l.unitPriceCents);
	const subtotalCents = lineTotals.reduce((sum, n) => sum + n, 0);
	const taxCents = Math.round((subtotalCents * taxRateBp) / 10_000);
	return {
		lineTotals,
		subtotalCents,
		taxCents,
		totalCents: subtotalCents + taxCents,
	};
}

export function quoteNumberLabel(n: number) {
	return `QUO-${String(n).padStart(4, "0")}`;
}

export function orderNumberLabel(n: number) {
	return `ORD-${String(n).padStart(4, "0")}`;
}

export function invoiceNumberLabel(year: number | null, n: number | null) {
	return year && n ? `INV-${year}-${String(n).padStart(4, "0")}` : "Draft";
}
