import { z } from "zod";
import type { FieldDef, ObjectKey } from "#/modules/fields/schema";
import { m } from "#/paraglide/messages.js";

// Saved views (spec §7.3): filters (all must match), columns and sort for the
// contact and company lists. Shared by the list pages and the server, which
// checks every filter against the field definitions before building SQL.

export const VIEW_LIMITS = {
	viewsPerMember: 50,
	filtersPerView: 20,
	columnsPerView: 30,
	valuesPerFilter: 100,
} as const;

// What a field holds, which decides the operators it accepts
export type FilterKind =
	| "text"
	| "number"
	| "date"
	| "boolean"
	| "choice"
	| "multi"
	| "ref";

export const OPERATORS = [
	"contains",
	"is",
	"eq",
	"gt",
	"lt",
	"between",
	"any_of",
	"is_true",
	"is_false",
	"is_empty",
	"not_empty",
] as const;
export type Operator = (typeof OPERATORS)[number];

export const KIND_OPERATORS: Record<FilterKind, readonly Operator[]> = {
	text: ["contains", "is", "is_empty", "not_empty"],
	number: ["eq", "gt", "lt", "between", "is_empty", "not_empty"],
	date: ["eq", "gt", "lt", "between", "is_empty", "not_empty"],
	boolean: ["is_true", "is_false"],
	choice: ["any_of", "is_empty", "not_empty"],
	multi: ["any_of", "is_empty", "not_empty"],
	ref: ["any_of", "is_empty", "not_empty"],
};

export const CUSTOM_KIND: Record<string, FilterKind> = {
	text: "text",
	long_text: "text",
	email: "text",
	phone: "text",
	url: "text",
	number: "number",
	money: "number",
	percent: "number",
	date: "date",
	checkbox: "boolean",
	single_choice: "choice",
	multiple_choice: "multi",
};

// Built-in fields that can be filtered, per record type. "ref" fields take ids
// (members, companies, tags) checked against the workspace on the server.
export const BUILT_IN_FIELDS: Record<
	ObjectKey,
	Record<string, { kind: FilterKind; label: () => string }>
> = {
	contact: {
		name: { kind: "text", label: m.contacts_col_name },
		email: { kind: "text", label: m.contact_email },
		phone: { kind: "text", label: m.common_phone },
		jobTitle: { kind: "text", label: m.contact_job_title },
		lifecycleStage: { kind: "choice", label: m.contact_stage },
		emailConsent: { kind: "choice", label: m.contact_consent },
		ownerId: { kind: "ref", label: m.common_owner },
		companyId: { kind: "ref", label: m.contact_company },
		tag: { kind: "ref", label: m.tags_label },
		createdAt: { kind: "date", label: m.contacts_col_added },
	},
	company: {
		name: { kind: "text", label: m.company_name },
		domain: { kind: "text", label: m.company_domain },
		phone: { kind: "text", label: m.common_phone },
		city: { kind: "text", label: m.common_city },
		country: { kind: "choice", label: m.common_country },
		ownerId: { kind: "ref", label: m.common_owner },
		tag: { kind: "ref", label: m.tags_label },
		createdAt: { kind: "date", label: m.contacts_col_added },
	},
	deal: {
		name: { kind: "text", label: m.deal_name },
		pipelineId: { kind: "ref", label: m.deal_pipeline },
		stageId: { kind: "ref", label: m.deal_stage },
		status: { kind: "choice", label: m.deal_status },
		companyId: { kind: "ref", label: m.contact_company },
		ownerId: { kind: "ref", label: m.common_owner },
		tag: { kind: "ref", label: m.tags_label },
		expectedCloseAt: { kind: "date", label: m.deal_expected_close },
		createdAt: { kind: "date", label: m.contacts_col_added },
	},
	quote: {
		status: { kind: "choice", label: m.quote_status },
		companyId: { kind: "ref", label: m.contact_company },
		ownerId: { kind: "ref", label: m.common_owner },
		tag: { kind: "ref", label: m.tags_label },
		validUntil: { kind: "date", label: m.quote_valid_until },
		createdAt: { kind: "date", label: m.contacts_col_added },
	},
	order: {
		status: { kind: "choice", label: m.quote_status },
		companyId: { kind: "ref", label: m.contact_company },
		ownerId: { kind: "ref", label: m.common_owner },
		tag: { kind: "ref", label: m.tags_label },
		orderDate: { kind: "date", label: m.order_date },
		createdAt: { kind: "date", label: m.contacts_col_added },
	},
	invoice: {
		status: { kind: "choice", label: m.quote_status },
		companyId: { kind: "ref", label: m.contact_company },
		ownerId: { kind: "ref", label: m.common_owner },
		tag: { kind: "ref", label: m.tags_label },
		issueDate: { kind: "date", label: m.invoice_issue_date },
		dueDate: { kind: "date", label: m.invoice_due_date },
		createdAt: { kind: "date", label: m.contacts_col_added },
	},
	project: {
		name: { kind: "text", label: m.project_name },
		status: { kind: "choice", label: m.quote_status },
		companyId: { kind: "ref", label: m.contact_company },
		ownerId: { kind: "ref", label: m.common_owner },
		tag: { kind: "ref", label: m.tags_label },
		startDate: { kind: "date", label: m.project_start },
		dueDate: { kind: "date", label: m.project_due },
		createdAt: { kind: "date", label: m.contacts_col_added },
	},
	product: {
		name: { kind: "text", label: m.product_name },
		sku: { kind: "text", label: m.product_sku },
		description: { kind: "text", label: m.product_description },
		createdAt: { kind: "date", label: m.contacts_col_added },
	},
};

// Columns a list can show; "name" is always shown first
export const BUILT_IN_COLUMNS: Record<ObjectKey, string[]> = {
	contact: [
		"email",
		"phone",
		"jobTitle",
		"companyId",
		"lifecycleStage",
		"tags",
		"ownerId",
		"emailConsent",
		"createdAt",
	],
	company: [
		"domain",
		"phone",
		"contactCount",
		"tags",
		"location",
		"ownerId",
		"createdAt",
	],
	deal: [
		"valueCents",
		"stageId",
		"status",
		"contactId",
		"companyId",
		"expectedCloseAt",
		"tags",
		"ownerId",
		"createdAt",
	],
	product: ["sku", "unitPriceCents", "description", "createdAt"],
	quote: [
		"status",
		"contactId",
		"companyId",
		"dealId",
		"totalCents",
		"validUntil",
		"createdAt",
	],
	order: [
		"status",
		"contactId",
		"companyId",
		"dealId",
		"orderDate",
		"totalCents",
		"createdAt",
	],
	invoice: [
		"status",
		"contactId",
		"companyId",
		"orderId",
		"issueDate",
		"dueDate",
		"totalCents",
		"createdAt",
	],
	project: [
		"status",
		"contactId",
		"companyId",
		"dealId",
		"startDate",
		"dueDate",
		"ownerId",
		"createdAt",
	],
};
export const DEFAULT_COLUMNS: Record<ObjectKey, string[]> = {
	contact: [
		"email",
		"companyId",
		"lifecycleStage",
		"tags",
		"ownerId",
		"createdAt",
	],
	company: [
		"domain",
		"contactCount",
		"tags",
		"location",
		"ownerId",
		"createdAt",
	],
	deal: ["valueCents", "stageId", "contactId", "expectedCloseAt", "ownerId"],
	product: ["sku", "unitPriceCents", "description"],
	quote: ["status", "contactId", "dealId", "totalCents", "validUntil"],
	order: ["status", "contactId", "orderDate", "totalCents"],
	invoice: ["status", "contactId", "issueDate", "dueDate", "totalCents"],
	project: ["status", "contactId", "dueDate", "ownerId"],
};
export const DEFAULT_SORT: Record<
	ObjectKey,
	{ field: string; dir: "asc" | "desc" }
> = {
	contact: { field: "createdAt", dir: "desc" },
	company: { field: "name", dir: "asc" },
	deal: { field: "createdAt", dir: "desc" },
	product: { field: "name", dir: "asc" },
	quote: { field: "number", dir: "desc" },
	order: { field: "number", dir: "desc" },
	invoice: { field: "createdAt", dir: "desc" },
	project: { field: "createdAt", dir: "desc" },
};
// Built-in columns the server can sort by
export const BUILT_IN_SORT: Record<ObjectKey, string[]> = {
	contact: ["name", "email", "lifecycleStage", "createdAt"],
	company: ["name", "domain", "createdAt"],
	deal: ["name", "valueCents", "expectedCloseAt", "createdAt"],
	product: ["name", "sku", "unitPriceCents", "createdAt"],
	quote: ["number", "totalCents", "validUntil", "createdAt"],
	order: ["number", "orderDate", "totalCents", "createdAt"],
	invoice: ["number", "issueDate", "dueDate", "totalCents", "createdAt"],
	project: ["name", "startDate", "dueDate", "createdAt"],
};

const filterValue = z.union([
	z.string().max(255),
	z.number().finite(),
	z.array(z.string().max(255)).max(VIEW_LIMITS.valuesPerFilter),
	z.tuple([
		z.union([z.number(), z.string().max(10)]),
		z.union([z.number(), z.string().max(10)]),
	]),
]);

export const filterSchema = z.object({
	// A built-in field id, or "custom.<key>"
	field: z.string().max(60),
	op: z.enum(OPERATORS),
	value: filterValue.optional(),
});
export type Filter = z.infer<typeof filterSchema>;

export const filtersSchema = z
	.array(filterSchema)
	.max(VIEW_LIMITS.filtersPerView);

export const viewConfigSchema = z.object({
	filters: filtersSchema,
	columns: z.array(z.string().max(60)).max(VIEW_LIMITS.columnsPerView),
	sort: z.object({ field: z.string().max(60), dir: z.enum(["asc", "desc"]) }),
});
export type ViewConfig = z.infer<typeof viewConfigSchema>;

// The kind of any filterable field: built-in, or an active custom field
export function fieldKind(
	objectKey: ObjectKey,
	field: string,
	defs: FieldDef[],
): { kind: FilterKind; def?: FieldDef } | null {
	if (field.startsWith("custom.")) {
		const def = defs.find((d) => !d.archivedAt && `custom.${d.key}` === field);
		const kind = def ? CUSTOM_KIND[def.type] : undefined;
		return def && kind ? { kind, def } : null;
	}
	// Own keys only: "constructor" or "toString" are not fields
	if (!Object.hasOwn(BUILT_IN_FIELDS[objectKey], field)) return null;
	return { kind: BUILT_IN_FIELDS[objectKey][field].kind };
}

// A real calendar day as YYYY-MM-DD (2024-13-45 is not)
const isDay = (v: unknown) =>
	typeof v === "string" &&
	/^\d{4}-\d{2}-\d{2}$/.test(v) &&
	!Number.isNaN(Date.parse(`${v}T12:00:00Z`)) &&
	new Date(`${v}T12:00:00Z`).toISOString().startsWith(v);

// A filter is usable when the field exists, the operator fits its kind and the
// value has the right shape. Returns a message for the first problem, or null.
export function filterProblem(
	objectKey: ObjectKey,
	filter: Filter,
	defs: FieldDef[],
) {
	const found = fieldKind(objectKey, filter.field, defs);
	if (!found) return m.error_filter_field();
	const { kind } = found;
	if (!KIND_OPERATORS[kind].includes(filter.op))
		return m.error_filter_operator();
	const v = filter.value;
	switch (filter.op) {
		case "is_empty":
		case "not_empty":
		case "is_true":
		case "is_false":
			return null;
		case "contains":
		case "is":
			return typeof v === "string" && v.trim() ? null : m.error_filter_value();
		case "any_of":
			return Array.isArray(v) &&
				v.length &&
				v.every((x) => typeof x === "string")
				? null
				: m.error_filter_value();
		case "between":
			return Array.isArray(v) &&
				v.length === 2 &&
				(kind === "date"
					? v.every(isDay)
					: v.every((x) => typeof x === "number"))
				? null
				: m.error_filter_value();
		default:
			// eq, gt, lt
			return (
				kind === "date"
					? isDay(v)
					: typeof v === "number" && Number.isFinite(v)
			)
				? null
				: m.error_filter_value();
	}
}

export const viewNameSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_view_name_required() })
	.max(60, { error: () => m.validation_text_max({ max: 60 }) });
