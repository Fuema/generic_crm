import {
	bpToPercent,
	centsToInput,
	formatMoney,
	parseMoneyToCents,
	parsePercentToBp,
} from "#/lib/money";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import { type FieldDef, localized } from "./schema";

// Converts between what a form input holds (strings, booleans, arrays) and what
// is stored in `custom` (cents, basis points, numbers, "YYYY-MM-DD").

export type FormValue = string | boolean | string[];

export function toFormValue(def: FieldDef, stored: unknown): FormValue {
	if (def.type === "checkbox") return stored === true;
	if (def.type === "multiple_choice")
		return Array.isArray(stored) ? (stored as string[]) : [];
	if (stored === null || stored === undefined) return "";
	if (def.type === "money" && typeof stored === "number")
		return centsToInput(stored);
	if (def.type === "percent" && typeof stored === "number")
		return bpToPercent(stored);
	return String(stored);
}

// Empty becomes null (no value). A value that doesn't parse is passed on as
// typed, so the shared validation reports it with the field's name.
export function fromFormValue(def: FieldDef, value: FormValue): unknown {
	if (def.type === "checkbox") return value === true;
	if (def.type === "multiple_choice")
		return Array.isArray(value) && value.length ? value : null;
	const text = typeof value === "string" ? value.trim() : "";
	if (!text) return null;
	switch (def.type) {
		case "number": {
			const n = Number(text.replace(/,/g, ""));
			return Number.isFinite(n) ? n : text;
		}
		case "money": {
			const negative = text.startsWith("-");
			const cents = parseMoneyToCents(negative ? text.slice(1) : text);
			return cents === null ? text : negative ? -cents : cents;
		}
		case "percent": {
			const bp = parsePercentToBp(text);
			return bp === null ? text : bp;
		}
		default:
			return text;
	}
}

// A stored value for display on a record page
export function formatValue(def: FieldDef, stored: unknown, currency: string) {
	if (stored === null || stored === undefined || stored === "") return "";
	switch (def.type) {
		case "checkbox":
			return stored === true ? m.common_yes() : m.common_no();
		case "money":
			return typeof stored === "number" ? formatMoney(stored, currency) : "";
		case "percent":
			return typeof stored === "number" ? `${bpToPercent(stored)} %` : "";
		case "number":
			return typeof stored === "number"
				? stored.toLocaleString(getLocale())
				: "";
		case "date":
			return typeof stored === "string"
				? new Date(`${stored}T12:00:00Z`).toLocaleDateString(getLocale(), {
						timeZone: "UTC",
					})
				: "";
		case "single_choice":
			return localized(def.options.find((o) => o.value === stored)?.label);
		case "multiple_choice":
			return Array.isArray(stored)
				? stored
						.map((v) =>
							localized(def.options.find((o) => o.value === v)?.label),
						)
						.filter(Boolean)
						.join(", ")
				: "";
		default:
			return String(stored);
	}
}
