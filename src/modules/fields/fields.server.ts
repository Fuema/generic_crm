import {
	and,
	asc,
	count,
	eq,
	inArray,
	isNull,
	max,
	notInArray,
	sql,
} from "drizzle-orm";
import { db } from "#/db/index";
import {
	company,
	contact,
	deal,
	fieldDefinition,
	fieldGroup,
	invoice,
	product,
	quote,
	salesOrder,
} from "#/db/schema";
import { m } from "#/paraglide/messages.js";
import {
	type Actor,
	changedFields,
	eventInsert,
} from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import type { Json } from "#/platform/json";
import {
	type CreateFieldInput,
	FIELD_LIMITS,
	type FieldDef,
	type FieldType,
	keyFromLabel,
	type Localized,
	localized,
	type ObjectKey,
	UNIQUE_TYPES,
	type UpdateFieldInput,
	validateCustomValues,
} from "./schema";

// Server-only data layer for field groups and definitions, plus the check every
// record write runs on its custom values. Workspace id first, always.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

const RECORD_TABLES = {
	contact,
	company,
	deal,
	product,
	quote,
	order: salesOrder,
	invoice,
} as const;

const definitionColumns = {
	id: fieldDefinition.id,
	key: fieldDefinition.key,
	label: fieldDefinition.label,
	help: fieldDefinition.help,
	type: fieldDefinition.type,
	options: fieldDefinition.options,
	required: fieldDefinition.required,
	unique: fieldDefinition.unique,
	groupId: fieldDefinition.groupId,
	position: fieldDefinition.position,
	archivedAt: fieldDefinition.archivedAt,
};

// Groups and fields of one record type, ordered for display
export async function listFields(
	workspaceId: string,
	objectKey: ObjectKey,
	{ includeArchived }: { includeArchived: boolean },
) {
	const [groups, fields] = await Promise.all([
		db
			.select({
				id: fieldGroup.id,
				label: fieldGroup.label,
				position: fieldGroup.position,
				archivedAt: fieldGroup.archivedAt,
			})
			.from(fieldGroup)
			.where(
				and(
					eq(fieldGroup.workspaceId, workspaceId),
					eq(fieldGroup.objectKey, objectKey),
					includeArchived ? undefined : isNull(fieldGroup.archivedAt),
				),
			)
			.orderBy(asc(fieldGroup.position), asc(fieldGroup.id)),
		db
			.select(definitionColumns)
			.from(fieldDefinition)
			.where(
				and(
					eq(fieldDefinition.workspaceId, workspaceId),
					eq(fieldDefinition.objectKey, objectKey),
					includeArchived ? undefined : isNull(fieldDefinition.archivedAt),
				),
			)
			.orderBy(asc(fieldDefinition.position), asc(fieldDefinition.id)),
	]);
	return { groups, fields: fields as FieldDef[] };
}

async function findField(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(fieldDefinition)
		.where(
			and(
				eq(fieldDefinition.id, id),
				eq(fieldDefinition.workspaceId, workspaceId),
			),
		)
		.limit(1);
	if (!row) throw clientError(404, m.error_field_not_found());
	return row as typeof row & { objectKey: ObjectKey };
}

async function findGroup(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(fieldGroup)
		.where(and(eq(fieldGroup.id, id), eq(fieldGroup.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_group_not_found());
	return row as typeof row & { objectKey: ObjectKey };
}

// A group must belong to the same workspace and record type
async function assertGroup(
	workspaceId: string,
	objectKey: ObjectKey,
	groupId: string,
) {
	if (!groupId) return;
	const group = await findGroup(workspaceId, groupId).catch(() => null);
	if (!group || group.objectKey !== objectKey)
		throw clientError(400, m.error_group_not_found());
}

const nullIfEmpty = (l: Localized) => (l.en || l.es ? l : null);

// ------------------------------------------------------------- fields

// `fixedKey` is for templates (server-side only): their views refer to fields by key
export async function createField(
	workspaceId: string,
	actor: Actor,
	input: CreateFieldInput,
	fixedKey?: string,
) {
	const { objectKey } = input;
	await assertGroup(workspaceId, objectKey, input.groupId);
	const existing = await db
		.select({
			key: fieldDefinition.key,
			archivedAt: fieldDefinition.archivedAt,
		})
		.from(fieldDefinition)
		.where(
			and(
				eq(fieldDefinition.workspaceId, workspaceId),
				eq(fieldDefinition.objectKey, objectKey),
			),
		);
	if (
		existing.filter((f) => !f.archivedAt).length >=
			FIELD_LIMITS.fieldsPerObject ||
		existing.length >= FIELD_LIMITS.totalFieldsPerObject
	) {
		throw clientError(
			409,
			m.error_field_limit({ max: FIELD_LIMITS.fieldsPerObject }),
		);
	}
	// A readable, unique key: membership_level, membership_level_2, …
	const taken = new Set(existing.map((f) => f.key));
	const base = fixedKey ?? keyFromLabel(input.label);
	let key = base;
	for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

	const [{ last }] = await db
		.select({ last: max(fieldDefinition.position) })
		.from(fieldDefinition)
		.where(
			and(
				eq(fieldDefinition.workspaceId, workspaceId),
				eq(fieldDefinition.objectKey, objectKey),
			),
		);
	const id = uuidv7();
	try {
		await db.batch([
			db.insert(fieldDefinition).values({
				id,
				workspaceId,
				objectKey,
				key,
				label: input.label,
				help: nullIfEmpty(input.help),
				type: input.type,
				options: input.options,
				required: input.required,
				unique: input.unique,
				groupId: input.groupId || null,
				position: (last ?? -1) + 1,
			}),
			eventInsert(workspaceId, actor, {
				type: "field.created",
				subjectType: "field_definition",
				subjectId: id,
				payload: { objectKey, key, type: input.type },
			}),
		]);
	} catch (error) {
		// Another field with the same label was created at the same moment
		const e = error as { code?: string; cause?: { code?: string } };
		if (e?.code === "23505" || e?.cause?.code === "23505")
			throw clientError(409, m.error_try_again());
		throw error;
	}
	return { id, key };
}

// Records of this type whose value equals one of the given option values
async function optionInUse(
	workspaceId: string,
	objectKey: ObjectKey,
	key: string,
	values: string[],
) {
	if (!values.length) return null;
	const table = RECORD_TABLES[objectKey];
	for (const value of values) {
		const [row] = await db
			.select({ id: table.id })
			.from(table)
			.where(
				and(
					eq(table.workspaceId, workspaceId),
					sql`(${table.custom} -> ${key} = to_jsonb(${value}::text) or ${table.custom} -> ${key} @> to_jsonb(array[${value}::text]))`,
				),
			)
			.limit(1);
		if (row) return value;
	}
	return null;
}

export async function updateField(
	workspaceId: string,
	actor: Actor,
	input: UpdateFieldInput,
) {
	const before = await findField(workspaceId, input.id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	const type = before.type as FieldType;
	await assertGroup(workspaceId, before.objectKey, input.groupId);

	// Rules that depend on the (fixed) type
	const isChoice = type === "single_choice" || type === "multiple_choice";
	if (isChoice && input.options.length === 0)
		throw clientError(400, m.validation_options_required());
	if (!isChoice && input.options.length > 0)
		throw clientError(400, m.validation_options_not_allowed());
	if (new Set(input.options.map((o) => o.value)).size !== input.options.length)
		throw clientError(400, m.validation_options_duplicate());
	if (input.unique && !UNIQUE_TYPES.includes(type))
		throw clientError(400, m.validation_unique_not_allowed());

	// An option still used by a record can't be removed (rename it instead)
	const removed = before.options
		.map((o) => o.value)
		.filter((v) => !input.options.some((o) => o.value === v));
	const used = await optionInUse(
		workspaceId,
		before.objectKey,
		before.key,
		removed,
	);
	if (used) {
		const label = localized(
			before.options.find((o) => o.value === used)?.label,
		);
		throw clientError(409, m.error_option_in_use({ option: label }));
	}
	// Turning "unique" on needs the existing values to be unique already
	if (input.unique && !before.unique) {
		const table = RECORD_TABLES[before.objectKey];
		const [dup] = await db
			.select({ n: count() })
			.from(table)
			.where(
				and(
					eq(table.workspaceId, workspaceId),
					sql`${table.custom} ? ${before.key}`,
				),
			)
			.groupBy(sql`lower(${table.custom} ->> ${before.key})`)
			.having(sql`count(*) > 1`)
			.limit(1);
		if (dup) throw clientError(409, m.error_field_has_duplicates());
	}

	const values = {
		label: input.label,
		help: nullIfEmpty(input.help),
		options: input.options,
		required: input.required,
		unique: input.unique,
		groupId: input.groupId || null,
	};
	const changes = changedFields(before, values);
	if (!Object.keys(changes).length) return { id: input.id };
	await db.batch([
		db
			.update(fieldDefinition)
			.set({ ...values, updatedAt: new Date() })
			.where(
				and(
					eq(fieldDefinition.id, input.id),
					eq(fieldDefinition.workspaceId, workspaceId),
				),
			),
		eventInsert(workspaceId, actor, {
			type: "field.updated",
			subjectType: "field_definition",
			subjectId: input.id,
			payload: { changes: Object.keys(changes) },
		}),
	]);
	return { id: input.id };
}

// Archiving hides the field and keeps its values; restoring brings both back
export async function setFieldArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findField(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	if (!archived) {
		const [{ active }] = await db
			.select({ active: count() })
			.from(fieldDefinition)
			.where(
				and(
					eq(fieldDefinition.workspaceId, workspaceId),
					eq(fieldDefinition.objectKey, before.objectKey),
					isNull(fieldDefinition.archivedAt),
				),
			);
		if (active >= FIELD_LIMITS.fieldsPerObject)
			throw clientError(
				409,
				m.error_field_limit({ max: FIELD_LIMITS.fieldsPerObject }),
			);
	}
	await db.batch([
		db
			.update(fieldDefinition)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(
				and(
					eq(fieldDefinition.id, id),
					eq(fieldDefinition.workspaceId, workspaceId),
				),
			),
		eventInsert(workspaceId, actor, {
			type: archived ? "field.archived" : "field.restored",
			subjectType: "field_definition",
			subjectId: id,
			payload: { key: before.key },
		}),
	]);
	return { id };
}

// Sets positions in the given order; ids of other workspaces or types are ignored
export async function reorder(
	workspaceId: string,
	table: "field" | "group",
	objectKey: ObjectKey,
	ids: string[],
) {
	const target = table === "field" ? fieldDefinition : fieldGroup;
	const owned = await db
		.select({ id: target.id })
		.from(target)
		.where(
			and(
				eq(target.workspaceId, workspaceId),
				eq(target.objectKey, objectKey),
				inArray(target.id, ids.length ? ids : ["-"]),
			),
		);
	const ownedIds = new Set(owned.map((r) => r.id));
	const updates = ids
		.filter((id) => ownedIds.has(id))
		.map((id, position) =>
			db
				.update(target)
				.set({ position })
				.where(and(eq(target.id, id), eq(target.workspaceId, workspaceId))),
		);
	if (updates.length)
		await db.batch(updates as [(typeof updates)[number], ...typeof updates]);
	return { count: updates.length };
}

// ------------------------------------------------------------- groups

export async function createGroup(
	workspaceId: string,
	actor: Actor,
	input: { objectKey: ObjectKey; label: Localized },
) {
	const [{ active }] = await db
		.select({ active: count() })
		.from(fieldGroup)
		.where(
			and(
				eq(fieldGroup.workspaceId, workspaceId),
				eq(fieldGroup.objectKey, input.objectKey),
				isNull(fieldGroup.archivedAt),
			),
		);
	if (active >= FIELD_LIMITS.groupsPerObject)
		throw clientError(
			409,
			m.error_group_limit({ max: FIELD_LIMITS.groupsPerObject }),
		);
	const [{ last }] = await db
		.select({ last: max(fieldGroup.position) })
		.from(fieldGroup)
		.where(
			and(
				eq(fieldGroup.workspaceId, workspaceId),
				eq(fieldGroup.objectKey, input.objectKey),
			),
		);
	const id = uuidv7();
	await db.batch([
		db.insert(fieldGroup).values({
			id,
			workspaceId,
			objectKey: input.objectKey,
			label: input.label,
			position: (last ?? -1) + 1,
		}),
		eventInsert(workspaceId, actor, {
			type: "field_group.created",
			subjectType: "field_group",
			subjectId: id,
			payload: { objectKey: input.objectKey },
		}),
	]);
	return { id };
}

export async function updateGroup(
	workspaceId: string,
	actor: Actor,
	input: { id: string; label: Localized },
) {
	const before = await findGroup(workspaceId, input.id);
	if (JSON.stringify(before.label) === JSON.stringify(input.label))
		return { id: input.id };
	await db.batch([
		db
			.update(fieldGroup)
			.set({ label: input.label, updatedAt: new Date() })
			.where(
				and(
					eq(fieldGroup.id, input.id),
					eq(fieldGroup.workspaceId, workspaceId),
				),
			),
		eventInsert(workspaceId, actor, {
			type: "field_group.updated",
			subjectType: "field_group",
			subjectId: input.id,
		}),
	]);
	return { id: input.id };
}

// Fields of an archived group are shown without a group; restoring brings it back
export async function setGroupArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findGroup(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	await db.batch([
		db
			.update(fieldGroup)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(
				and(eq(fieldGroup.id, id), eq(fieldGroup.workspaceId, workspaceId)),
			),
		eventInsert(workspaceId, actor, {
			type: archived ? "field_group.archived" : "field_group.restored",
			subjectType: "field_group",
			subjectId: id,
		}),
	]);
	return { id };
}

// ------------------------------------------------- record custom values

// Checks a record's custom values on every create and update: validates them
// against the active definitions (unknown keys dropped), keeps the values of
// archived fields as they were, and enforces unique fields. Throws 400/409 with
// the first problem; returns the values to store.
export async function prepareCustom(
	workspaceId: string,
	objectKey: ObjectKey,
	input: Record<string, unknown>,
	existing: Record<string, Json> = {},
	// The record being saved (and, for a merge, the duplicate giving up its values)
	exceptId?: string | string[],
) {
	const except = typeof exceptId === "string" ? [exceptId] : (exceptId ?? []);
	const { fields } = await listFields(workspaceId, objectKey, {
		includeArchived: true,
	});
	const { values, errors } = validateCustomValues(fields, input);
	const firstError = Object.values(errors)[0];
	if (firstError) throw clientError(400, firstError);

	const result: Record<string, Json> = {};
	for (const def of fields) {
		if (def.archivedAt) {
			if (Object.hasOwn(existing, def.key)) result[def.key] = existing[def.key];
		} else if (Object.hasOwn(values, def.key)) {
			result[def.key] = values[def.key] as Json;
		}
	}

	const table = RECORD_TABLES[objectKey];
	for (const def of fields) {
		if (def.archivedAt || !def.unique || typeof result[def.key] !== "string")
			continue;
		const [dup] = await db
			.select({ id: table.id })
			.from(table)
			.where(
				and(
					eq(table.workspaceId, workspaceId),
					sql`lower(${table.custom} ->> ${def.key}) = lower(${result[def.key] as string})`,
					except.length ? notInArray(table.id, except) : undefined,
				),
			)
			.limit(1);
		if (dup)
			throw clientError(
				409,
				m.error_custom_unique({ field: localized(def.label) }),
			);
	}
	return result;
}

// Field changes for an *.updated event: custom.<key> -> { from, to }
export function customChanges(
	before: Record<string, Json>,
	after: Record<string, Json>,
) {
	const changes: Record<string, { from: Json; to: Json }> = {};
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
		const from = before[key] ?? null;
		const to = after[key] ?? null;
		if (JSON.stringify(from) !== JSON.stringify(to))
			changes[`custom.${key}`] = { from, to };
	}
	return changes;
}
