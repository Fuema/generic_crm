import { z } from "zod";
import { computeTotals } from "#/lib/money";
import { m } from "#/paraglide/messages.js";

// Lines and totals shared by quotes, orders and invoices (spec §6.2): a line
// is a catalog product (its name, SKU and price copied) or free text, with a
// whole quantity. One tax rate per document, rounded once on the subtotal.
// Shared by the pages and the server; the server recomputes every total.

export const DOCUMENT_LIMITS = {
	linesPerDocument: 100,
	maxQuantity: 1_000_000,
	// Every amount is an integer column (32-bit)
	maxCents: 2_000_000_000,
} as const;

const optionalId = z.union([
	z.literal(""),
	z.uuid({ error: () => m.validation_invalid_id() }),
]);

export const documentLineSchema = z.object({
	// The catalog product it came from, or "" for a free-text line
	productId: optionalId,
	description: z
		.string()
		.trim()
		.min(1, { error: () => m.validation_line_description() })
		.max(500, { error: () => m.validation_text_max({ max: 500 }) }),
	sku: z
		.string()
		.trim()
		.max(32, { error: () => m.validation_text_max({ max: 32 }) }),
	quantity: z
		.number()
		.int({ error: () => m.validation_quantity() })
		.min(1, { error: () => m.validation_quantity() })
		.max(DOCUMENT_LIMITS.maxQuantity, { error: () => m.validation_quantity() }),
	unitPriceCents: z
		.number()
		.int()
		.min(0, { error: () => m.validation_price() })
		.max(DOCUMENT_LIMITS.maxCents, { error: () => m.validation_price() }),
});
export type DocumentLineInput = z.infer<typeof documentLineSchema>;

export const documentLinesSchema = z
	.array(documentLineSchema)
	.max(DOCUMENT_LIMITS.linesPerDocument, {
		error: () =>
			m.validation_lines_max({ max: DOCUMENT_LIMITS.linesPerDocument }),
	});

export const taxRateSchema = z
	.number()
	.int()
	.min(0, { error: () => m.validation_tax_rate_max() })
	.max(10_000, { error: () => m.validation_tax_rate_max() });

// Totals of a set of lines, or the problem when an amount doesn't fit
export function documentTotals(
	lines: { quantity: number; unitPriceCents: number }[],
	taxRateBp: number,
) {
	const totals = computeTotals(lines, taxRateBp);
	const tooBig =
		totals.totalCents > DOCUMENT_LIMITS.maxCents ||
		totals.lineTotals.some((t) => t > DOCUMENT_LIMITS.maxCents);
	return { ...totals, problem: tooBig ? m.validation_quote_too_large() : null };
}

// A stored line, as documents show and copy it
export type DocumentLine = {
	id: string;
	productId: string | null;
	description: string;
	sku: string | null;
	quantity: number;
	unitPriceCents: number;
	lineTotalCents: number;
};

// "YYYY-MM-DD" of a moment, in UTC
export function utcDay(at: Date) {
	return at.toISOString().slice(0, 10);
}

// A "YYYY-MM-DD" day as stored (12:00 UTC), or null for ""
export function dayToStored(day: string) {
	return day ? new Date(`${day}T12:00:00.000Z`) : null;
}

// "" or a real calendar day ("2024-02-31" would otherwise roll over)
export const optionalDaySchema = z.string().refine(
	(v) => {
		if (v === "") return true;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
		const d = new Date(`${v}T12:00:00.000Z`);
		return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
	},
	{ error: () => m.validation_date() },
);
