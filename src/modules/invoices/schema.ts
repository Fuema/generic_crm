import { z } from "zod";
import { listSearchSchema } from "#/lib/schema";
import { viewState } from "#/modules/contacts/schema";
import { documentLinesSchema, taxRateSchema } from "#/modules/documents/lines";
import { m } from "#/paraglide/messages.js";

// Invoices (spec §6.2, §10), rebuilt on contacts in phase 2 step 5: from an
// order (one invoice per order that isn't void) or direct for a contact.
// Numbered INV-2026-0001 when issued; an issued invoice never changes, it can
// only be voided. Confirmed payments make it partially paid, then paid.

export const INVOICE_STATUSES = [
	"draft",
	"issued",
	"partially_paid",
	"paid",
	"void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
// "overdue": issued and past its due day, worked out when read
export type InvoiceDisplayStatus = InvoiceStatus | "overdue";
export const INVOICE_DISPLAY_STATUSES = [
	...INVOICE_STATUSES,
	"overdue",
] as const;

export const INVOICE_STATUS_LABELS: Record<
	InvoiceDisplayStatus,
	typeof m.invoice_status_draft
> = {
	draft: m.invoice_status_draft,
	issued: m.invoice_status_issued,
	partially_paid: m.invoice_status_partially_paid,
	paid: m.invoice_status_paid,
	void: m.invoice_status_void,
	overdue: m.invoice_status_overdue,
};

export const INVOICE_LIMITS = {
	// Invoice emails: per workspace in 24 hours, and per invoice in total
	emailsPerDay: 50,
	emailsPerInvoice: 5,
} as const;

export function invoiceDisplayStatus(
	status: string,
	dueDate: Date | string | null,
	now: Date = new Date(),
): InvoiceDisplayStatus {
	if (
		(status === "issued" || status === "partially_paid") &&
		dueDate &&
		new Date(dueDate).toISOString().slice(0, 10) <
			now.toISOString().slice(0, 10)
	)
		return "overdue";
	return status as InvoiceStatus;
}

// INV-2026-0001; drafts have no number yet
export function invoiceLabel(year: number | null, number: number | null) {
	return year && number ? `INV-${year}-${String(number).padStart(4, "0")}` : "";
}

const id = z.uuid({ error: () => m.validation_invalid_id() });
const optionalId = z.union([z.literal(""), id]);

// A direct draft for a contact or deal, or the invoice of an order
export const createInvoiceSchema = z
	.object({
		contactId: id.optional(),
		dealId: id.optional(),
		orderId: id.optional(),
	})
	.refine((v) => v.contactId || v.dealId || v.orderId, {
		error: () => m.validation_deal_contact_required(),
	});

export const updateInvoiceSchema = z.object({
	id,
	contactId: id,
	companyId: optionalId,
	ownerId: z.string().max(64, { error: () => m.validation_invalid_id() }),
	locale: z.enum(["en", "es"]),
	taxRateBp: taxRateSchema,
	notes: z
		.string()
		.trim()
		.max(2000, { error: () => m.validation_text_max({ max: 2000 }) }),
	lines: documentLinesSchema,
	custom: z
		.record(z.string().max(40), z.unknown())
		.refine((r) => Object.keys(r).length <= 100)
		.optional(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const invoiceIdSchema = z.object({ id });

export const invoiceSearchSchema = listSearchSchema(
	INVOICE_DISPLAY_STATUSES,
	["number", "issueDate", "dueDate", "totalCents", "createdAt"],
	"createdAt",
).extend({
	show: z.enum(["active", "archived"]).catch("active").default("active"),
	...viewState("createdAt"),
});
export type InvoiceSearch = z.infer<typeof invoiceSearchSchema>;

export const relatedInvoicesSchema = z.object({
	contactId: id.optional(),
	dealId: id.optional(),
	orderId: id.optional(),
});
