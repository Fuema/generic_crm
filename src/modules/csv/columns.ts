import {
	CONSENT_LABELS,
	LIFECYCLE_STAGES,
	STAGE_LABELS,
} from "#/modules/contacts/schema";
import {
	type FieldDef,
	localized,
	type ObjectKey,
} from "#/modules/fields/schema";
import { m } from "#/paraglide/messages.js";

// The fields an import can fill and an export writes, per record type, with the
// column names they are recognised by (English and Spanish, any case/accents).

export type ImportField = {
	id: string;
	label: () => string;
	aliases: string[];
};

export const IMPORT_FIELDS: Record<ObjectKey, ImportField[]> = {
	contact: [
		{
			id: "firstName",
			label: m.contact_first_name,
			aliases: ["first name", "firstname", "given name", "nombre"],
		},
		{
			id: "lastName",
			label: m.contact_last_name,
			aliases: [
				"last name",
				"lastname",
				"surname",
				"family name",
				"apellidos",
				"apellido",
			],
		},
		{
			id: "email",
			label: m.contact_email,
			aliases: [
				"email",
				"e-mail",
				"email address",
				"correo",
				"correo electronico",
			],
		},
		{
			id: "phone",
			label: m.common_phone,
			aliases: ["phone", "telephone", "mobile", "telefono", "movil"],
		},
		{
			id: "jobTitle",
			label: m.contact_job_title,
			aliases: ["job title", "title", "position", "cargo", "puesto"],
		},
		{
			id: "company",
			label: m.contact_company,
			aliases: [
				"company",
				"organization",
				"organisation",
				"empresa",
				"compania",
			],
		},
		{
			id: "lifecycleStage",
			label: m.contact_stage,
			aliases: ["stage", "lifecycle stage", "status", "etapa", "estado"],
		},
		{
			id: "owner",
			label: m.common_owner,
			aliases: ["owner", "owner email", "responsable"],
		},
		{
			id: "locale",
			label: m.contact_language,
			aliases: ["language", "preferred language", "idioma"],
		},
		{
			id: "emailConsent",
			label: m.contact_consent,
			aliases: ["email consent", "consent", "consentimiento"],
		},
		{
			id: "tags",
			label: m.tags_label,
			aliases: ["tags", "labels", "etiquetas"],
		},
	],
	company: [
		{
			id: "name",
			label: m.company_name,
			aliases: ["name", "company", "company name", "nombre", "empresa"],
		},
		{
			id: "domain",
			label: m.company_domain,
			aliases: ["domain", "website domain", "dominio"],
		},
		{
			id: "phone",
			label: m.common_phone,
			aliases: ["phone", "telephone", "telefono"],
		},
		{ id: "city", label: m.common_city, aliases: ["city", "town", "ciudad"] },
		{ id: "country", label: m.common_country, aliases: ["country", "pais"] },
		{
			id: "owner",
			label: m.common_owner,
			aliases: ["owner", "owner email", "responsable"],
		},
		{
			id: "tags",
			label: m.tags_label,
			aliases: ["tags", "labels", "etiquetas"],
		},
	],
};

// "Correo electrónico " -> "correo electronico"
export function normalize(text: string) {
	return text
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[_\-.]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

// Column index -> field id ("custom.<key>" for custom fields), "" = ignore
export function guessMapping(
	objectKey: ObjectKey,
	headers: string[],
	defs: FieldDef[],
) {
	const used = new Set<string>();
	return headers.map((header) => {
		const h = normalize(header);
		const builtIn = IMPORT_FIELDS[objectKey].find(
			(f) =>
				!used.has(f.id) &&
				(normalize(f.id) === h ||
					f.aliases.includes(h) ||
					normalize(f.label()) === h),
		);
		const custom = builtIn
			? undefined
			: defs.find(
					(d) =>
						!d.archivedAt &&
						!used.has(`custom.${d.key}`) &&
						[d.key, d.label.en, d.label.es].some(
							(n) => n && normalize(n) === h,
						),
				);
		const id = builtIn?.id ?? (custom ? `custom.${custom.key}` : "");
		if (id) used.add(id);
		return id;
	});
}

// A label in either language, or the stored value, to the stored value
function matchOption(
	text: string,
	options: { value: string; labels: string[] }[],
) {
	const t = normalize(text);
	return options.find(
		(o) => normalize(o.value) === t || o.labels.some((l) => normalize(l) === t),
	)?.value;
}

export function stageFromText(text: string) {
	return matchOption(
		text,
		LIFECYCLE_STAGES.map((s) => ({
			value: s,
			labels: [
				STAGE_LABELS[s]({}, { locale: "en" }),
				STAGE_LABELS[s]({}, { locale: "es" }),
			],
		})),
	);
}

export function consentFromText(text: string) {
	return matchOption(
		text,
		(["unknown", "granted", "revoked"] as const).map((c) => ({
			value: c,
			labels: [
				CONSENT_LABELS[c]({}, { locale: "en" }),
				CONSENT_LABELS[c]({}, { locale: "es" }),
				c === "granted" ? "yes" : c === "revoked" ? "no" : "",
			],
		})),
	);
}

const TRUE = new Set(["yes", "true", "1", "si", "x", "y"]);
const FALSE = new Set(["no", "false", "0", "n", ""]);

// Cell text -> the value custom-field validation expects. Unparseable text is
// passed on unchanged so the shared validation reports it with the field name.
export function customFromText(def: FieldDef, text: string): unknown {
	const t = text.trim();
	if (!t) return null;
	const options = def.options.map((o) => ({
		value: o.value,
		labels: [o.label.en, o.label.es],
	}));
	switch (def.type) {
		case "number": {
			const n = Number(t.replace(/\s/g, "").replace(/,(?=\d{3}\b)/g, ""));
			return Number.isFinite(n) ? n : t;
		}
		case "money": {
			const n = Number(
				t
					.replace(/[^\d.,-]/g, "")
					.replace(/,(?=\d{3}\b)/g, "")
					.replace(",", "."),
			);
			return Number.isFinite(n) ? Math.round(n * 100) : t;
		}
		case "percent": {
			const n = Number(t.replace(/[%\s]/g, "").replace(",", "."));
			return Number.isFinite(n) ? Math.round(n * 100) : t;
		}
		case "checkbox": {
			const v = normalize(t);
			return TRUE.has(v) ? true : FALSE.has(v) ? false : t;
		}
		case "single_choice":
			return matchOption(t, options) ?? t;
		case "multiple_choice":
			return t
				.split(/[;,|]/)
				.map((part) => part.trim())
				.filter(Boolean)
				.map((part) => matchOption(part, options) ?? part);
		default:
			return t;
	}
}

// A stored custom value as export text (labels in the export's language)
export function customToText(def: FieldDef, value: unknown) {
	if (value === null || value === undefined) return "";
	switch (def.type) {
		case "money":
		case "percent":
			return typeof value === "number" ? (value / 100).toFixed(2) : "";
		case "checkbox":
			return value === true ? m.common_yes() : m.common_no();
		case "single_choice":
			return (
				localized(def.options.find((o) => o.value === value)?.label) ||
				String(value)
			);
		case "multiple_choice":
			return Array.isArray(value)
				? value
						.map(
							(v) =>
								localized(def.options.find((o) => o.value === v)?.label) || v,
						)
						.join("; ")
				: "";
		default:
			return String(value);
	}
}
