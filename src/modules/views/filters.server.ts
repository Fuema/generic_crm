import { type SQL, sql } from "drizzle-orm";
import type { FieldDef, ObjectKey } from "#/modules/fields/schema";
import { m } from "#/paraglide/messages.js";
import { type Filter, fieldKind, filterProblem } from "./schema";

// Server-only. Turns checked filters and a sort into SQL for the contact and
// company lists. Values are always bound parameters; the only raw SQL is fixed
// table and column names (spelled out, see spec pitfall 13).

const TABLE: Record<ObjectKey, string> = {
	contact: `"contact"`,
	company: `"company"`,
	deal: `"deal"`,
	product: `"product"`,
	quote: `"quote"`,
	order: `"sales_order"`,
	invoice: `"invoice"`,
};

// Built-in columns by field id (raw, fixed names only)
const COLUMNS: Record<ObjectKey, Record<string, string>> = {
	contact: {
		name: `concat_ws(' ', "contact"."first_name", "contact"."last_name")`,
		email: `"contact"."email"`,
		phone: `"contact"."phone"`,
		jobTitle: `"contact"."job_title"`,
		lifecycleStage: `"contact"."lifecycle_stage"`,
		emailConsent: `"contact"."email_consent"`,
		ownerId: `"contact"."owner_id"`,
		companyId: `"contact"."company_id"`,
		createdAt: `"contact"."created_at"`,
	},
	company: {
		name: `"company"."name"`,
		domain: `"company"."domain"`,
		phone: `"company"."phone"`,
		city: `"company"."city"`,
		country: `"company"."country"`,
		ownerId: `"company"."owner_id"`,
		createdAt: `"company"."created_at"`,
	},
	deal: {
		name: `"deal"."name"`,
		pipelineId: `"deal"."pipeline_id"`,
		stageId: `"deal"."stage_id"`,
		status: `"deal"."status"`,
		contactId: `"deal"."contact_id"`,
		companyId: `"deal"."company_id"`,
		ownerId: `"deal"."owner_id"`,
		expectedCloseAt: `"deal"."expected_close_at"`,
		createdAt: `"deal"."created_at"`,
	},
	quote: {
		status: `"quote"."status"`,
		companyId: `"quote"."company_id"`,
		ownerId: `"quote"."owner_id"`,
		validUntil: `"quote"."valid_until"`,
		createdAt: `"quote"."created_at"`,
	},
	order: {
		status: `"sales_order"."status"`,
		companyId: `"sales_order"."company_id"`,
		ownerId: `"sales_order"."owner_id"`,
		orderDate: `"sales_order"."order_date"`,
		createdAt: `"sales_order"."created_at"`,
	},
	invoice: {
		status: `"invoice"."status"`,
		companyId: `"invoice"."company_id"`,
		ownerId: `"invoice"."owner_id"`,
		issueDate: `"invoice"."issue_date"`,
		dueDate: `"invoice"."due_date"`,
		createdAt: `"invoice"."created_at"`,
	},
	product: {
		name: `"product"."name"`,
		sku: `"product"."sku"`,
		description: `"product"."description"`,
		createdAt: `"product"."created_at"`,
	},
};

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const list = (values: unknown[]) =>
	sql.join(
		values.map((v) => sql`${v}`),
		sql`, `,
	);

// A record has the given tag (any of the ids)
function tagFilter(objectKey: ObjectKey, ids: string[]) {
	const t = TABLE[objectKey];
	return sql`exists (select 1 from "record_tag" rt where rt."subject_type" = ${objectKey} and rt."subject_id" = ${sql.raw(`${t}."id"`)} and rt."workspace_id" = ${sql.raw(`${t}."workspace_id"`)} and rt."tag_id" in (${list(ids)}))`;
}

function builtInFilter(objectKey: ObjectKey, f: Filter): SQL {
	if (f.field === "tag") {
		const t = TABLE[objectKey];
		const any = sql`exists (select 1 from "record_tag" rt where rt."subject_type" = ${objectKey} and rt."subject_id" = ${sql.raw(`${t}."id"`)} and rt."workspace_id" = ${sql.raw(`${t}."workspace_id"`)})`;
		if (f.op === "is_empty") return sql`not ${any}`;
		if (f.op === "not_empty") return any;
		return tagFilter(objectKey, f.value as string[]);
	}
	const col = sql.raw(COLUMNS[objectKey][f.field]);
	const v = f.value;
	switch (f.op) {
		case "contains":
			return sql`${col} ilike ${likePattern(String(v))}`;
		case "is":
			return sql`lower(${col}) = lower(${String(v)})`;
		case "any_of":
			return sql`${col} in (${list(v as string[])})`;
		case "is_empty":
			return sql`(${col} is null or ${col}::text = '')`;
		case "not_empty":
			return sql`(${col} is not null and ${col}::text <> '')`;
		// Built-in dates (created, expected close, valid until): calendar days (UTC)
		case "eq":
			return sql`(${col} at time zone 'UTC')::date = ${v}::date`;
		case "gt":
			return sql`(${col} at time zone 'UTC')::date > ${v}::date`;
		case "lt":
			return sql`(${col} at time zone 'UTC')::date < ${v}::date`;
		case "between": {
			const [from, to] = v as [string, string];
			return sql`(${col} at time zone 'UTC')::date between ${from}::date and ${to}::date`;
		}
		default:
			throw new Response(m.error_filter_operator(), { status: 400 });
	}
}

function customFilter(
	objectKey: ObjectKey,
	f: Filter,
	def: FieldDef,
	kind: string,
): SQL {
	const custom = sql.raw(`${TABLE[objectKey]}."custom"`);
	const key = def.key;
	const text = sql`(${custom} ->> ${key})`;
	// Cast only real JSON numbers, so a stray value can never break the query
	const num = sql`(case when jsonb_typeof(${custom} -> ${key}) = 'number' then (${custom} ->> ${key})::numeric end)`;
	const v = f.value;
	switch (f.op) {
		case "is_empty":
			return sql`not (${custom} ? ${key})`;
		case "not_empty":
			return sql`(${custom} ? ${key})`;
		case "contains":
			return sql`${text} ilike ${likePattern(String(v))}`;
		case "is":
			return sql`lower(${text}) = lower(${String(v)})`;
		case "is_true":
			return sql`(${custom} -> ${key}) = 'true'::jsonb`;
		case "is_false":
			return sql`coalesce(${custom} -> ${key}, 'false'::jsonb) = 'false'::jsonb`;
		case "any_of":
			return kind === "multi"
				? sql`(${custom} -> ${key}) ?| array[${list(v as string[])}]::text[]`
				: sql`${text} in (${list(v as string[])})`;
		case "eq":
			return kind === "date" ? sql`${text} = ${v}` : sql`${num} = ${v}`;
		case "gt":
			return kind === "date" ? sql`${text} > ${v}` : sql`${num} > ${v}`;
		case "lt":
			return kind === "date" ? sql`${text} < ${v}` : sql`${num} < ${v}`;
		case "between": {
			const [from, to] = v as [string | number, string | number];
			return kind === "date"
				? sql`${text} between ${from} and ${to}`
				: sql`${num} between ${from} and ${to}`;
		}
		default:
			throw new Response(m.error_filter_operator(), { status: 400 });
	}
}

// Every filter must be valid (400 otherwise); all of them must match (AND)
export function filterConditions(
	objectKey: ObjectKey,
	filters: Filter[],
	defs: FieldDef[],
) {
	return filters.map((f) => {
		const problem = filterProblem(objectKey, f, defs);
		if (problem) throw new Response(problem, { status: 400 });
		const found = fieldKind(objectKey, f.field, defs);
		if (!found) throw new Response(m.error_filter_field(), { status: 400 });
		return found.def
			? customFilter(objectKey, f, found.def, found.kind)
			: builtInFilter(objectKey, f);
	});
}

// ORDER BY for a built-in sortable column or a custom field (empty values last)
export function sortExpression(
	objectKey: ObjectKey,
	sort: { field: string; dir: "asc" | "desc" },
	defs: FieldDef[],
	builtIn: Record<string, SQL | unknown>,
) {
	const dir = sql.raw(sort.dir === "asc" ? "asc" : "desc");
	if (sort.field.startsWith("custom.")) {
		const found = fieldKind(objectKey, sort.field, defs);
		if (!found?.def)
			throw new Response(m.error_filter_field(), { status: 400 });
		const custom = sql.raw(`${TABLE[objectKey]}."custom"`);
		const key = found.def.key;
		const value =
			found.kind === "number"
				? sql`(case when jsonb_typeof(${custom} -> ${key}) = 'number' then (${custom} ->> ${key})::numeric end)`
				: sql`lower(${custom} ->> ${key})`;
		return sql`${value} ${dir} nulls last`;
	}
	const column = Object.hasOwn(builtIn, sort.field)
		? builtIn[sort.field]
		: undefined;
	if (!column) throw new Response(m.error_filter_field(), { status: 400 });
	return sql`${column} ${dir}`;
}
