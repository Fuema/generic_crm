import { z } from "zod";
import { listSearchSchema } from "#/lib/schema";
import { viewState } from "#/modules/contacts/schema";
import {
	documentLinesSchema,
	optionalDaySchema,
	taxRateSchema,
} from "#/modules/documents/lines";
import { m } from "#/paraglide/messages.js";

// Orders (spec §6.2, §10), rebuilt on contacts in phase 2 step 5. Shared by
// the pages and the server; the server recomputes totals and checks every
// reference. Only drafts change.

export const ORDER_STATUSES = [
	"draft",
	"confirmed",
	"fulfilled",
	"cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<
	OrderStatus,
	typeof m.order_status_draft
> = {
	draft: m.order_status_draft,
	confirmed: m.order_status_confirmed,
	fulfilled: m.order_status_fulfilled,
	cancelled: m.order_status_cancelled,
};

const id = z.uuid({ error: () => m.validation_invalid_id() });
const optionalId = z.union([z.literal(""), id]);

// A new draft for a contact or a deal, or the order of an accepted quote
export const createOrderSchema = z
	.object({
		contactId: id.optional(),
		dealId: id.optional(),
		quoteId: id.optional(),
	})
	.refine((v) => v.contactId || v.dealId || v.quoteId, {
		error: () => m.validation_deal_contact_required(),
	});

export const updateOrderSchema = z.object({
	id,
	contactId: id,
	companyId: optionalId,
	ownerId: z.string().max(64, { error: () => m.validation_invalid_id() }),
	locale: z.enum(["en", "es"]),
	taxRateBp: taxRateSchema,
	orderDate: optionalDaySchema,
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
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const orderIdSchema = z.object({ id });

// Status changes from the order page
export const ORDER_ACTIONS = ["confirm", "fulfil", "cancel", "reopen"] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];
export const orderActionSchema = z.object({
	id,
	action: z.enum(ORDER_ACTIONS),
});

// action -> the statuses it starts from, and where it leads
export const ORDER_TRANSITIONS: Record<
	OrderAction,
	{ from: OrderStatus[]; to: OrderStatus }
> = {
	confirm: { from: ["draft"], to: "confirmed" },
	fulfil: { from: ["confirmed"], to: "fulfilled" },
	cancel: { from: ["draft", "confirmed"], to: "cancelled" },
	reopen: { from: ["confirmed"], to: "draft" },
};

export const orderSearchSchema = listSearchSchema(
	ORDER_STATUSES,
	["number", "orderDate", "totalCents", "createdAt"],
	"number",
).extend({
	show: z.enum(["active", "archived"]).catch("active").default("active"),
	...viewState("number"),
});
export type OrderSearch = z.infer<typeof orderSearchSchema>;

export const relatedOrdersSchema = z.object({
	contactId: id.optional(),
	dealId: id.optional(),
	quoteId: id.optional(),
});
