import { describe, expect, test } from "bun:test";
import type { FieldDef } from "#/modules/fields/schema";
import { type Filter, fieldKind, filterProblem } from "#/modules/views/schema";

// The filter rules shared by the list pages and the server (spec §7.3)
const def = (
	key: string,
	type: string,
	patch: Partial<FieldDef> = {},
): FieldDef => ({
	id: `00000000-0000-7000-8000-${key.padStart(12, "0").slice(-12)}`,
	key,
	label: { en: key, es: key },
	help: null,
	type,
	options: [],
	required: false,
	unique: false,
	groupId: null,
	position: 0,
	archivedAt: null,
	...patch,
});

const defs = [
	def("budget", "money"),
	def("since", "date"),
	def("vip", "checkbox"),
	def("plan", "single_choice"),
	def("old", "text", { archivedAt: new Date() }),
];

const ok = (f: Filter) => expect(filterProblem("contact", f, defs)).toBeNull();
const bad = (f: Filter) =>
	expect(filterProblem("contact", f, defs)).not.toBeNull();

describe("filterProblem", () => {
	test("accepts filters whose operator and value fit the field", () => {
		ok({ field: "name", op: "contains", value: "ana" });
		ok({ field: "lifecycleStage", op: "any_of", value: ["lead", "customer"] });
		ok({
			field: "createdAt",
			op: "between",
			value: ["2026-01-01", "2026-12-31"],
		});
		ok({ field: "custom.budget", op: "gt", value: 10_000 });
		ok({ field: "custom.since", op: "lt", value: "2025-01-01" });
		ok({ field: "custom.vip", op: "is_true" });
		ok({ field: "custom.plan", op: "is_empty" });
		ok({ field: "tag", op: "any_of", value: ["t1"] });
	});

	test("rejects unknown or archived fields, wrong operators and bad values", () => {
		bad({ field: "password", op: "contains", value: "x" });
		bad({ field: "custom.missing", op: "is_empty" });
		bad({ field: "custom.old", op: "contains", value: "x" });
		bad({ field: "custom.budget", op: "contains", value: "10" });
		bad({ field: "custom.budget", op: "gt", value: "lots" });
		bad({ field: "custom.since", op: "gt", value: "01/01/2025" });
		bad({ field: "custom.vip", op: "eq", value: 1 });
		bad({ field: "name", op: "contains", value: "  " });
		bad({ field: "lifecycleStage", op: "any_of", value: [] });
		bad({
			field: "createdAt",
			op: "between",
			value: ["2026-01-01"] as unknown as [string, string],
		});
	});

	test("built-in JavaScript names and impossible dates are refused, not crashed on", () => {
		bad({ field: "constructor", op: "is", value: "x" });
		bad({ field: "toString", op: "is_empty" });
		bad({ field: "createdAt", op: "eq", value: "2024-13-45" });
		bad({ field: "custom.since", op: "eq", value: "2025-02-30" });
		ok({ field: "createdAt", op: "eq", value: "2024-02-29" });
	});

	test("company fields are separate from contact fields", () => {
		expect(fieldKind("company", "country", [])?.kind).toBe("choice");
		expect(fieldKind("contact", "country", [])).toBeNull();
		expect(fieldKind("company", "lifecycleStage", [])).toBeNull();
	});
});
