import { z } from "zod";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

// Custom fields engine (spec §7.1–7.2), shared by forms and server. The server
// builds the value schema from the stored definitions on every write and never
// trusts the client's copy.

export const OBJECT_KEYS = ["contact", "company"] as const;
export type ObjectKey = (typeof OBJECT_KEYS)[number];

export const FIELD_TYPES = [
	"text",
	"long_text",
	"number",
	"money",
	"percent",
	"date",
	"checkbox",
	"single_choice",
	"multiple_choice",
	"email",
	"phone",
	"url",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const CHOICE_TYPES: readonly FieldType[] = [
	"single_choice",
	"multiple_choice",
];
export const UNIQUE_TYPES: readonly FieldType[] = ["text", "email"];

export const FIELD_LIMITS = {
	fieldsPerObject: 75,
	// Archived fields included: every record write loads all definitions
	totalFieldsPerObject: 300,
	groupsPerObject: 15,
	optionsPerField: 100,
} as const;

export type Localized = { en: string; es: string };

export type FieldOption = { value: string; label: Localized };

// What forms and the server need to know about a field
export type FieldDef = {
	id: string;
	key: string;
	label: Localized;
	help: Localized | null;
	type: string;
	options: FieldOption[];
	required: boolean;
	unique: boolean;
	groupId: string | null;
	position: number;
	archivedAt: Date | string | null;
};

// A label in the page language, falling back to the other one
export function localized(
	label: Localized | null | undefined,
	locale: string = getLocale(),
) {
	if (!label) return "";
	return (locale === "es" ? label.es || label.en : label.en || label.es) ?? "";
}

// --------------------------------------------------------- definitions

const localizedText = (max: number) =>
	z.object({
		en: z
			.string()
			.trim()
			.max(max, { error: () => m.validation_text_max({ max }) }),
		es: z
			.string()
			.trim()
			.max(max, { error: () => m.validation_text_max({ max }) }),
	});

const labelSchema = localizedText(60).refine((l) => l.en || l.es, {
	error: () => m.validation_label_required(),
});

const optionSchema = z.object({
	value: z
		.string()
		.regex(/^[a-z0-9_]{1,40}$/, { error: () => m.validation_invalid_id() }),
	label: labelSchema,
});

const fieldSettings = {
	label: labelSchema,
	help: localizedText(200),
	options: z.array(optionSchema).max(FIELD_LIMITS.optionsPerField, {
		error: () =>
			m.validation_options_max({ max: FIELD_LIMITS.optionsPerField }),
	}),
	required: z.boolean(),
	unique: z.boolean(),
	groupId: z.union([
		z.literal(""),
		z.uuid({ error: () => m.validation_invalid_id() }),
	]),
};

// Rules that depend on the type: options only (and at least one) for choices,
// unique only for text and email, option values unique
function checkTypeRules(
	type: string,
	data: { options: FieldOption[]; unique: boolean },
	ctx: z.RefinementCtx,
) {
	const isChoice = CHOICE_TYPES.includes(type as FieldType);
	if (isChoice && data.options.length === 0) {
		ctx.addIssue({
			code: "custom",
			path: ["options"],
			message: m.validation_options_required(),
		});
	}
	if (!isChoice && data.options.length > 0) {
		ctx.addIssue({
			code: "custom",
			path: ["options"],
			message: m.validation_options_not_allowed(),
		});
	}
	const values = data.options.map((o) => o.value);
	if (new Set(values).size !== values.length) {
		ctx.addIssue({
			code: "custom",
			path: ["options"],
			message: m.validation_options_duplicate(),
		});
	}
	if (data.unique && !UNIQUE_TYPES.includes(type as FieldType)) {
		ctx.addIssue({
			code: "custom",
			path: ["unique"],
			message: m.validation_unique_not_allowed(),
		});
	}
}

export const createFieldSchema = z
	.object({
		objectKey: z.enum(OBJECT_KEYS),
		type: z.enum(FIELD_TYPES),
		...fieldSettings,
	})
	.superRefine((d, ctx) => checkTypeRules(d.type, d, ctx));
export type CreateFieldInput = z.infer<typeof createFieldSchema>;

// The key and the type never change after creation
export const updateFieldSchema = z.object({
	id: z.uuid({ error: () => m.validation_invalid_id() }),
	...fieldSettings,
});
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;

export const createGroupSchema = z.object({
	objectKey: z.enum(OBJECT_KEYS),
	label: labelSchema,
});
export const updateGroupSchema = z.object({
	id: z.uuid({ error: () => m.validation_invalid_id() }),
	label: labelSchema,
});

export const reorderSchema = z.object({
	objectKey: z.enum(OBJECT_KEYS),
	ids: z.array(z.uuid()).max(FIELD_LIMITS.fieldsPerObject),
});

export const objectKeySchema = z.object({ objectKey: z.enum(OBJECT_KEYS) });
export const fieldIdSchema = z.object({
	id: z.uuid({ error: () => m.validation_invalid_id() }),
});

const RESERVED_KEYS = new Set(
	Object.getOwnPropertyNames(Object.prototype).map((k) => k.toLowerCase()),
);

// "Membership level" -> "membership_level"; unique suffixes are added by the server
export function keyFromLabel(label: Localized) {
	const base = (label.en || label.es)
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 36);
	// Names that exist on every JavaScript object ("constructor") would make
	// value lookups find built-ins instead of the record's own value
	if (/^[a-z]/.test(base) && !RESERVED_KEYS.has(base)) return base;
	return `f_${base || "field"}`.slice(0, 36);
}

// ------------------------------------------------------------- values

const phonePattern = (v: string) =>
	/^\+?[\d\s().-]+$/.test(v) &&
	(v.match(/\d/g)?.length ?? 0) >= 7 &&
	(v.match(/\d/g)?.length ?? 0) <= 15;

function isRealDate(v: string) {
	const d = new Date(`${v}T12:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// The schema of one stored (non-empty) value
function valueSchema(def: FieldDef): z.ZodType {
	const invalid = {
		error: () => m.validation_custom_invalid({ field: localized(def.label) }),
	};
	const values = def.options.map((o) => o.value);
	switch (def.type as FieldType) {
		case "text":
			return z.string().trim().min(1).max(255, invalid);
		case "long_text":
			return z.string().trim().min(1).max(5000, invalid);
		case "email":
			return z.string().trim().toLowerCase().pipe(z.email(invalid));
		case "phone":
			return z.string().trim().max(25, invalid).refine(phonePattern, invalid);
		case "url":
			return z
				.string()
				.trim()
				.max(2048, invalid)
				.pipe(z.url({ protocol: /^https?$/, ...invalid }));
		case "number":
			return z
				.number(invalid)
				.finite(invalid)
				.min(-1e12, invalid)
				.max(1e12, invalid);
		case "money":
			// Integer cents
			return z
				.number(invalid)
				.int(invalid)
				.min(-1e13, invalid)
				.max(1e13, invalid);
		case "percent":
			// Basis points: 825 = 8.25%
			return z
				.number(invalid)
				.int(invalid)
				.min(-100_000, invalid)
				.max(100_000, invalid);
		case "date":
			return z.string().refine(isRealDate, invalid);
		case "checkbox":
			return z.boolean(invalid);
		case "single_choice":
			return z.string().refine((v) => values.includes(v), invalid);
		case "multiple_choice":
			return z
				.array(z.string().refine((v) => values.includes(v), invalid))
				.min(1)
				.max(FIELD_LIMITS.optionsPerField)
				.refine((a) => new Set(a).size === a.length, invalid);
		default:
			return z.never(invalid);
	}
}

// null, "" and [] mean "no value"; checkboxes are never empty (false is a value)
function isEmpty(def: FieldDef, v: unknown) {
	if (v === null || v === undefined) return true;
	if (def.type === "checkbox") return false;
	if (typeof v === "string") return v.trim() === "";
	if (Array.isArray(v)) return v.length === 0;
	return false;
}

// Validates custom values against the active definitions. Unknown keys are
// dropped; empty values are removed (or rejected when required). Returns the
// clean values, or the issues keyed by field key.
export function validateCustomValues(
	defs: FieldDef[],
	input: Record<string, unknown>,
) {
	const values: Record<string, unknown> = {};
	const errors: Record<string, string> = {};
	for (const def of defs) {
		if (def.archivedAt) continue;
		// Own keys only: never a value inherited from Object.prototype
		const raw = Object.hasOwn(input, def.key) ? input[def.key] : undefined;
		if (isEmpty(def, raw)) {
			if (def.required) {
				errors[def.key] = m.validation_custom_required({
					field: localized(def.label),
				});
			}
			continue;
		}
		const parsed = valueSchema(def).safeParse(raw);
		if (parsed.success) values[def.key] = parsed.data;
		else
			errors[def.key] =
				parsed.error.issues[0]?.message ??
				m.validation_custom_invalid({ field: localized(def.label) });
	}
	return { values, errors };
}
