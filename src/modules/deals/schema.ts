import { z } from "zod";
import { listSearchSchema } from "#/lib/schema";
import { viewState } from "#/modules/contacts/schema";
import { m } from "#/paraglide/messages.js";

// Deals (spec §6.2, §10). Shared by the pages and the server; the server
// re-checks everything (references against the workspace, stage against the
// pipeline, lost reason).

export const DEAL_STATUSES = ["open", "won", "lost"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_LABELS: Record<DealStatus, typeof m.stage_type_open> =
	{
		open: m.deal_status_open,
		won: m.deal_status_won,
		lost: m.deal_status_lost,
	};

// Integer cents; the column is a 32-bit integer
export const MAX_DEAL_CENTS = 2_000_000_000;

const id = z.uuid({ error: () => m.validation_invalid_id() });
const optionalId = z.union([z.literal(""), id]);
const optionalUserId = z
	.string()
	.max(64, { error: () => m.validation_invalid_id() });

// "" or a calendar day; stored at 12:00 UTC
const optionalDay = z
	.string()
	.refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
		error: () => m.validation_date(),
	})
	// Round trip: "2024-02-31" would otherwise roll over to 2 March
	.refine(
		(v) => {
			if (v === "") return true;
			const d = new Date(`${v}T12:00:00.000Z`);
			return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
		},
		{ error: () => m.validation_date() },
	);

export const lostReasonSchema = z
	.string()
	.trim()
	.max(500, { error: () => m.validation_text_max({ max: 500 }) });

export const dealInputSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.validation_deal_name_required() })
		.max(120, { error: () => m.validation_text_max({ max: 120 }) }),
	pipelineId: id,
	stageId: id,
	valueCents: z
		.number()
		.int()
		.min(0, { error: () => m.validation_deal_value() })
		.max(MAX_DEAL_CENTS, { error: () => m.validation_deal_value() }),
	expectedClose: optionalDay,
	contactId: z.uuid({ error: () => m.validation_deal_contact_required() }),
	companyId: optionalId,
	ownerId: optionalUserId,
	// Needed when the stage is a lost stage
	lostReason: lostReasonSchema.default(""),
	custom: z
		.record(z.string().max(40), z.unknown())
		.refine((r) => Object.keys(r).length <= 100)
		.optional(),
});
export type DealInput = z.infer<typeof dealInputSchema>;

export const updateDealSchema = dealInputSchema.extend({ id });

// Moving a deal on the board or the record page; lostReason for lost stages
export const moveDealSchema = z.object({
	id,
	stageId: id,
	lostReason: lostReasonSchema.default(""),
});

export const dealIdSchema = z.object({ id });

export const dealSearchSchema = listSearchSchema(
	DEAL_STATUSES,
	["name", "valueCents", "expectedCloseAt", "createdAt"],
	"createdAt",
).extend({
	show: z.enum(["active", "archived"]).catch("active").default("active"),
	layout: z.enum(["list", "board"]).catch("list").default("list"),
	pipeline: z.uuid().optional().catch(undefined),
	tag: z.uuid().optional().catch(undefined),
	...viewState("createdAt"),
});
export type DealSearch = z.infer<typeof dealSearchSchema>;

// Deals of one contact or company, for their record pages
export const relatedDealsSchema = z.object({
	contactId: id.optional(),
	companyId: id.optional(),
});

export const contactSearchSchema = z.object({
	q: z.string().trim().max(100).default(""),
});

// The stored all-day timestamp for a "YYYY-MM-DD" day, or null
export function dayToStored(day: string) {
	return day ? new Date(`${day}T12:00:00.000Z`) : null;
}

// "YYYY-MM-DD" for a stored all-day timestamp, or ""
export function storedToDay(value: Date | string | null) {
	return value ? new Date(value).toISOString().slice(0, 10) : "";
}

// A lost stage needs a reason; other stages drop it
export function lostReasonProblem(stageType: string, reason: string) {
	return stageType === "lost" && !reason.trim()
		? m.validation_lost_reason_required()
		: null;
}
