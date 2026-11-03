import { z } from "zod";
import { m } from "#/paraglide/messages.js";

// Merging two contacts (spec §6.2): the kept contact takes, field by field,
// either its own value or the duplicate's. Shared by the merge screen and the
// server; the server recomputes everything from the stored records and takes
// only the choices from the browser.

// Built-in fields that can be merged, in screen order
export const MERGE_FIELDS = [
	"firstName",
	"lastName",
	"email",
	"phone",
	"jobTitle",
	"companyId",
	"ownerId",
	"lifecycleStage",
	"locale",
	"emailConsent",
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];

export type MergeSide = "keep" | "duplicate";

// One choice per field that differs: a built-in name or "custom.<key>"
export const mergeChoicesSchema = z
	.record(z.string().max(80), z.enum(["keep", "duplicate"]))
	.refine((r) => Object.keys(r).length <= 200);

export const mergeContactsSchema = z
	.object({
		keepId: z.uuid({ error: () => m.validation_invalid_id() }),
		duplicateId: z.uuid({ error: () => m.validation_invalid_id() }),
		choices: mergeChoicesSchema.default({}),
	})
	.refine((v) => v.keepId !== v.duplicateId, {
		error: () => m.merge_same_contact(),
		path: ["duplicateId"],
	});
export type MergeContactsInput = z.infer<typeof mergeContactsSchema>;

export const mergeSearchSchema = z.object({
	excludeId: z.uuid({ error: () => m.validation_invalid_id() }),
	q: z.string().trim().max(100).default(""),
});

export type MergeRecord = {
	[K in MergeField]: string | null;
} & { custom: Record<string, unknown> };

// "Nothing here": missing, null, blank text, an empty list. Unknown email
// consent counts as empty, so a known consent (granted or revoked) is never lost.
export function isEmptyValue(field: string, value: unknown) {
	if (value === null || value === undefined) return true;
	if (typeof value === "string" && value.trim() === "") return true;
	if (Array.isArray(value) && value.length === 0) return true;
	if (field === "emailConsent" && value === "unknown") return true;
	return false;
}

function sameValue(a: unknown, b: unknown) {
	if (typeof a === "string" && typeof b === "string")
		return a.trim().toLowerCase() === b.trim().toLowerCase();
	return JSON.stringify(a) === JSON.stringify(b);
}

function customKeys(keep: MergeRecord, duplicate: MergeRecord) {
	return [
		...new Set([...Object.keys(keep.custom), ...Object.keys(duplicate.custom)]),
	];
}

function fieldValue(record: MergeRecord, field: string): unknown {
	return field.startsWith("custom.")
		? record.custom[field.slice(7)]
		: record[field as MergeField];
}

// Fields where both contacts have a value and the values differ: the ones the
// user has to choose for. Custom keys come as "custom.<key>".
export function mergeConflicts(keep: MergeRecord, duplicate: MergeRecord) {
	const fields = [
		...MERGE_FIELDS,
		...customKeys(keep, duplicate).map((k) => `custom.${k}`),
	];
	return fields.filter((field) => {
		const a = fieldValue(keep, field);
		const b = fieldValue(duplicate, field);
		return (
			!isEmptyValue(field, a) && !isEmptyValue(field, b) && !sameValue(a, b)
		);
	});
}

// Which side each field's value comes from: the only non-empty side, else the
// user's choice for a conflict (the kept contact by default).
export function mergeSource(
	field: string,
	keep: MergeRecord,
	duplicate: MergeRecord,
	choices: Record<string, MergeSide>,
): MergeSide {
	const a = fieldValue(keep, field);
	const b = fieldValue(duplicate, field);
	if (isEmptyValue(field, a) && !isEmptyValue(field, b)) return "duplicate";
	if (isEmptyValue(field, b) || sameValue(a, b)) return "keep";
	if (Object.hasOwn(choices, field)) return choices[field];
	// Without a choice, a recorded opt-out is never lost
	if (field === "emailConsent" && b === "revoked") return "duplicate";
	return "keep";
}

// The kept contact's values after the merge, plus the fields that came from the
// duplicate ("taken").
export function mergeValues<R extends MergeRecord>(
	keep: R,
	duplicate: R,
	choices: Record<string, MergeSide>,
) {
	const builtIn = {} as Pick<R, MergeField>;
	const taken: string[] = [];
	for (const field of MERGE_FIELDS) {
		const side = mergeSource(field, keep, duplicate, choices);
		builtIn[field] = side === "duplicate" ? duplicate[field] : keep[field];
		if (side === "duplicate") taken.push(field);
	}
	const custom: Record<string, unknown> = {};
	for (const key of customKeys(keep, duplicate)) {
		const field = `custom.${key}`;
		const side = mergeSource(field, keep, duplicate, choices);
		const value =
			side === "duplicate" ? duplicate.custom[key] : keep.custom[key];
		if (side === "duplicate") taken.push(field);
		if (!isEmptyValue(field, value)) custom[key] = value;
	}
	return { builtIn, custom, taken };
}

// Tag ids the kept contact gains, and whether the result stays within the limit
export function mergeTags(
	keepTagIds: string[],
	duplicateTagIds: string[],
	limit: number,
) {
	const have = new Set(keepTagIds);
	const added = [...new Set(duplicateTagIds)].filter((id) => !have.has(id));
	return {
		added,
		total: have.size + added.length,
		ok: have.size + added.length <= limit,
	};
}
