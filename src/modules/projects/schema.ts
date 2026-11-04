import { z } from "zod";
import { listSearchSchema } from "#/lib/schema";
import { viewState } from "#/modules/contacts/schema";
import { optionalDaySchema } from "#/modules/documents/lines";
import { m } from "#/paraglide/messages.js";

// Projects (spec §6.2, §10), phase 3 step 1. Shared by the pages and the
// server; the server re-checks every reference.

export const PROJECT_STATUSES = [
	"planned",
	"active",
	"on_hold",
	"completed",
	"cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<
	ProjectStatus,
	typeof m.project_status_planned
> = {
	planned: m.project_status_planned,
	active: m.project_status_active,
	on_hold: m.project_status_on_hold,
	completed: m.project_status_completed,
	cancelled: m.project_status_cancelled,
};

const id = z.uuid({ error: () => m.validation_invalid_id() });
const optionalId = z.union([z.literal(""), id]);

export const projectInputSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, { error: () => m.validation_project_name_required() })
			.max(120, { error: () => m.validation_text_max({ max: 120 }) }),
		description: z
			.string()
			.trim()
			.max(2000, { error: () => m.validation_text_max({ max: 2000 }) }),
		status: z.enum(PROJECT_STATUSES),
		startDate: optionalDaySchema,
		dueDate: optionalDaySchema,
		ownerId: z.string().max(64, { error: () => m.validation_invalid_id() }),
		contactId: optionalId,
		companyId: optionalId,
		custom: z
			.record(z.string().max(40), z.unknown())
			.refine((r) => Object.keys(r).length <= 100)
			.optional(),
	})
	.refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, {
		error: () => m.validation_project_dates(),
		path: ["dueDate"],
	});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const updateProjectSchema = z.object({ id }).and(projectInputSchema);

export const projectIdSchema = z.object({ id });

// "Create project" on a won deal: its name, contact and company come along
export const projectFromDealSchema = z.object({ dealId: id });

export const projectSearchSchema = listSearchSchema(
	PROJECT_STATUSES,
	["name", "startDate", "dueDate", "createdAt"],
	"createdAt",
).extend({
	show: z.enum(["active", "archived"]).catch("active").default("active"),
	...viewState("createdAt"),
});
export type ProjectSearch = z.infer<typeof projectSearchSchema>;

export const relatedProjectsSchema = z.object({
	contactId: id.optional(),
	companyId: id.optional(),
	dealId: id.optional(),
});
