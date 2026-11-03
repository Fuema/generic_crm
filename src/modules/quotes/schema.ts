import { z } from "zod";
import { computeTotals } from "#/lib/money";
import { listSearchSchema } from "#/lib/schema";
import { viewState } from "#/modules/contacts/schema";
import { m } from "#/paraglide/messages.js";

// Quotes (spec §6.2, §10). Shared by the pages and the server; the server
// recomputes every total and checks every reference.

export const QUOTE_STATUSES = [
	"draft",
	"sent",
	"accepted",
	"declined",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
// What a reader sees: a sent quote past its valid-until day is expired
export type QuoteDisplayStatus = QuoteStatus | "expired";
export const QUOTE_DISPLAY_STATUSES = [...QUOTE_STATUSES, "expired"] as const;

export const QUOTE_STATUS_LABELS: Record<
	QuoteDisplayStatus,
	typeof m.quote_status_draft
> = {
	draft: m.quote_status_draft,
	sent: m.quote_status_sent,
	accepted: m.quote_status_accepted,
	declined: m.quote_status_declined,
	expired: m.quote_status_expired,
};

export const QUOTE_LIMITS = {
	linesPerQuote: 100,
	maxQuantity: 1_000_000,
	// Every amount is an integer column (32-bit)
	maxCents: 2_000_000_000,
	validDays: 30,
	// Quote emails: per workspace in 24 hours, and per quote in total
	emailsPerDay: 50,
	emailsPerQuote: 5,
} as const;

// "YYYY-MM-DD" of a moment, in UTC
export function utcDay(at: Date) {
	return at.toISOString().slice(0, 10);
}

// The valid-until day is the last day the quote can be accepted
export function displayStatus(
	status: string,
	validUntil: Date | string | null,
	now: Date = new Date(),
): QuoteDisplayStatus {
	if (
		status === "sent" &&
		validUntil &&
		utcDay(new Date(validUntil)) < utcDay(now)
	)
		return "expired";
	return status as QuoteStatus;
}

// The default valid-until day when a quote is sent without one
export function defaultValidUntil(now: Date = new Date()) {
	const d = new Date(`${utcDay(now)}T12:00:00.000Z`);
	d.setUTCDate(d.getUTCDate() + QUOTE_LIMITS.validDays);
	return d;
}

// Totals of a set of lines, or the problem when an amount doesn't fit
export function quoteTotals(
	lines: { quantity: number; unitPriceCents: number }[],
	taxRateBp: number,
) {
	const totals = computeTotals(lines, taxRateBp);
	const tooBig =
		totals.totalCents > QUOTE_LIMITS.maxCents ||
		totals.lineTotals.some((t) => t > QUOTE_LIMITS.maxCents);
	return { ...totals, problem: tooBig ? m.validation_quote_too_large() : null };
}

const id = z.uuid({ error: () => m.validation_invalid_id() });
const optionalId = z.union([z.literal(""), id]);

const optionalDay = z.string().refine(
	(v) => {
		if (v === "") return true;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
		const d = new Date(`${v}T12:00:00.000Z`);
		return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
	},
	{ error: () => m.validation_date() },
);

export const quoteLineSchema = z.object({
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
		.max(QUOTE_LIMITS.maxQuantity, { error: () => m.validation_quantity() }),
	unitPriceCents: z
		.number()
		.int()
		.min(0, { error: () => m.validation_price() })
		.max(QUOTE_LIMITS.maxCents, { error: () => m.validation_price() }),
});
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;

// A new draft, from a deal (its contact and company come along) or a contact
export const createQuoteSchema = z
	.object({ dealId: id.optional(), contactId: id.optional() })
	.refine((v) => v.dealId || v.contactId, {
		error: () => m.validation_deal_contact_required(),
	});

export const updateQuoteSchema = z.object({
	id,
	contactId: id,
	companyId: optionalId,
	ownerId: z.string().max(64, { error: () => m.validation_invalid_id() }),
	locale: z.enum(["en", "es"]),
	taxRateBp: z
		.number()
		.int()
		.min(0, { error: () => m.validation_tax_rate_max() })
		.max(10_000, { error: () => m.validation_tax_rate_max() }),
	validUntil: optionalDay,
	notes: z
		.string()
		.trim()
		.max(2000, { error: () => m.validation_text_max({ max: 2000 }) }),
	lines: z.array(quoteLineSchema).max(QUOTE_LIMITS.linesPerQuote, {
		error: () => m.validation_lines_max({ max: QUOTE_LIMITS.linesPerQuote }),
	}),
	custom: z
		.record(z.string().max(40), z.unknown())
		.refine((r) => Object.keys(r).length <= 100)
		.optional(),
});
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;

export const quoteIdSchema = z.object({ id });

// Send: email the quote to the contact, or only mark it as sent
export const sendQuoteSchema = z.object({ id, email: z.boolean() });

export const declineQuoteSchema = z.object({
	id,
	reason: z
		.string()
		.trim()
		.max(500, { error: () => m.validation_text_max({ max: 500 }) })
		.default(""),
});

export const quoteSearchSchema = listSearchSchema(
	QUOTE_DISPLAY_STATUSES,
	["number", "totalCents", "validUntil", "createdAt"],
	"number",
).extend({
	show: z.enum(["active", "archived"]).catch("active").default("active"),
	...viewState("number"),
});
export type QuoteSearch = z.infer<typeof quoteSearchSchema>;

export const relatedQuotesSchema = z.object({
	contactId: id.optional(),
	dealId: id.optional(),
});
