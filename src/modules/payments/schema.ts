import { z } from "zod";
import { DOCUMENT_LIMITS } from "#/modules/documents/lines";
import { m } from "#/paraglide/messages.js";

// Payments against invoices (spec §6.2, §10). Shared by the invoice page and
// the server; the server re-checks the amount against the balance inside the
// same transaction that writes it.

export const PAYMENT_METHODS = [
	"bank_transfer",
	"cash",
	"card",
	"other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<
	PaymentMethod,
	typeof m.payment_method_cash
> = {
	bank_transfer: m.payment_method_bank_transfer,
	cash: m.payment_method_cash,
	card: m.payment_method_card,
	other: m.payment_method_other,
};

export const PAYMENT_STATUSES = ["reported", "confirmed", "rejected"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<
	PaymentStatus,
	typeof m.payment_status_reported
> = {
	reported: m.payment_status_reported,
	confirmed: m.payment_status_confirmed,
	rejected: m.payment_status_rejected,
};

const id = z.uuid({ error: () => m.validation_invalid_id() });

// A real calendar day, not in the future
const paidOnSchema = z.string().refine(
	(v) => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
		const d = new Date(`${v}T12:00:00.000Z`);
		if (Number.isNaN(d.getTime()) || !d.toISOString().startsWith(v))
			return false;
		// One day of slack: east of UTC, "today" is already tomorrow in UTC
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
		return v <= tomorrow.toISOString().slice(0, 10);
	},
	{ error: () => m.validation_payment_date() },
);

export const recordPaymentSchema = z.object({
	invoiceId: id,
	amountCents: z
		.number()
		.int()
		.min(1, { error: () => m.validation_payment_amount() })
		.max(DOCUMENT_LIMITS.maxCents, {
			error: () => m.validation_payment_amount(),
		}),
	paidOn: paidOnSchema,
	method: z.enum(PAYMENT_METHODS),
	reference: z
		.string()
		.trim()
		.max(100, { error: () => m.validation_text_max({ max: 100 }) }),
	note: z
		.string()
		.trim()
		.max(500, { error: () => m.validation_text_max({ max: 500 }) }),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const decidePaymentSchema = z.object({
	id,
	decision: z.enum(["confirm", "reject"]),
	reason: z
		.string()
		.trim()
		.max(500, { error: () => m.validation_text_max({ max: 500 }) })
		.default(""),
});

export const invoicePaymentsSchema = z.object({ invoiceId: id });

// The invoice status for an issued invoice with this much confirmed
export function paidStatus(totalCents: number, paidCents: number) {
	if (paidCents <= 0) return "issued" as const;
	return paidCents >= totalCents
		? ("paid" as const)
		: ("partially_paid" as const);
}
