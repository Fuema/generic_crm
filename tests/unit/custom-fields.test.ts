import { describe, expect, test } from "bun:test";
import {
	type FieldDef,
	keyFromLabel,
	validateCustomValues,
} from "#/modules/fields/schema";
import { fromFormValue, toFormValue } from "#/modules/fields/values";

// The value rules shared by forms and server (spec §7.1)
let n = 0;
function def(type: string, patch: Partial<FieldDef> = {}): FieldDef {
	n += 1;
	return {
		id: `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`,
		key: patch.key ?? `f${n}`,
		label: { en: `Field ${n}`, es: `Campo ${n}` },
		help: null,
		type,
		options: [],
		required: false,
		unique: false,
		groupId: null,
		position: n,
		archivedAt: null,
		...patch,
	};
}

const choice = (type: "single_choice" | "multiple_choice") =>
	def(type, {
		options: [
			{ value: "gold", label: { en: "Gold", es: "Oro" } },
			{ value: "silver", label: { en: "Silver", es: "Plata" } },
		],
	});

function check(d: FieldDef, value: unknown) {
	return validateCustomValues([d], { [d.key]: value });
}

describe("validateCustomValues", () => {
	test("accepts a valid value of every type", () => {
		const cases: [FieldDef, unknown][] = [
			[def("text"), "Hello"],
			[def("long_text"), "Line 1\nLine 2"],
			[def("number"), 3.5],
			[def("money"), 12_345],
			[def("percent"), 825],
			[def("date"), "2026-02-28"],
			[def("checkbox"), false],
			[choice("single_choice"), "gold"],
			[choice("multiple_choice"), ["gold", "silver"]],
			[def("email"), "Ana@Example.com"],
			[def("phone"), "+34 600 123 456"],
			[def("url"), "https://example.com/a"],
		];
		for (const [d, value] of cases) {
			const { values, errors } = check(d, value);
			expect(errors).toEqual({});
			expect(d.key in values).toBe(true);
		}
		expect(check(def("email", { key: "e" }), "Ana@Example.com").values.e).toBe(
			"ana@example.com",
		);
	});

	test("rejects wrong values with the field's name", () => {
		const cases: [FieldDef, unknown][] = [
			[def("number"), "12"],
			[def("money"), 12.5],
			[def("percent"), 8.25],
			[def("date"), "2026-02-30"],
			[def("date"), "28/02/2026"],
			[def("checkbox"), "yes"],
			[choice("single_choice"), "bronze"],
			[choice("multiple_choice"), ["gold", "gold"]],
			[choice("multiple_choice"), ["bronze"]],
			[def("email"), "not-an-email"],
			[def("phone"), "123"],
			[def("url"), "javascript:alert(1)"],
			[def("url"), "ftp://example.com"],
			[def("text"), "x".repeat(256)],
		];
		for (const [d, value] of cases) {
			const { errors } = check(d, value);
			expect(errors[d.key]).toContain(d.label.en);
		}
	});

	test("empty values are removed, and rejected when required", () => {
		for (const empty of [null, undefined, "", "  ", []]) {
			expect(check(def("text"), empty)).toEqual({ values: {}, errors: {} });
		}
		const required = def("text", { required: true });
		expect(check(required, "").errors[required.key]).toBeDefined();
		// A checkbox is never empty: false is a value
		const box = def("checkbox", { required: true, key: "box" });
		expect(check(box, false)).toEqual({ values: { box: false }, errors: {} });
	});

	test("unknown keys and archived fields are ignored", () => {
		const active = def("text", { key: "kept" });
		const archived = def("text", { key: "old", archivedAt: new Date() });
		const { values } = validateCustomValues([active, archived], {
			kept: "a",
			old: "b",
			hacked: "c",
		});
		expect(values).toEqual({ kept: "a" });
	});
});

describe("form conversions", () => {
	test("money, percent and numbers round-trip through form strings", () => {
		const money = def("money");
		expect(toFormValue(money, 12_345)).toBe("123.45");
		expect(fromFormValue(money, "123.45")).toBe(12_345);
		expect(fromFormValue(money, "-5")).toBe(-500);
		const percent = def("percent");
		expect(toFormValue(percent, 825)).toBe("8.25");
		expect(fromFormValue(percent, "8.25")).toBe(825);
		expect(fromFormValue(def("number"), "1,234.5")).toBe(1234.5);
	});

	test("empty becomes null; a value that doesn't parse is passed on for validation", () => {
		expect(fromFormValue(def("text"), "  ")).toBeNull();
		expect(fromFormValue(def("multiple_choice"), [])).toBeNull();
		expect(fromFormValue(def("money"), "12.345")).toBe("12.345");
		expect(fromFormValue(def("checkbox"), false)).toBe(false);
	});
});

test("keys come from the label, ASCII only, starting with a letter", () => {
	expect(keyFromLabel({ en: "Membership level", es: "" })).toBe(
		"membership_level",
	);
	expect(keyFromLabel({ en: "", es: "Número de socio" })).toBe(
		"numero_de_socio",
	);
	expect(keyFromLabel({ en: "2024 budget", es: "" })).toBe("f_2024_budget");
	// Names every JavaScript object already has are never used as keys
	expect(keyFromLabel({ en: "Constructor", es: "" })).toBe("f_constructor");
});

test("values inherited from Object.prototype are never read as field values", () => {
	const d = def("text", { key: "constructor", required: true });
	// The input has no own "constructor" key: it's missing, not a function
	expect(Object.entries(validateCustomValues([d], {}).errors)).toEqual([
		["constructor", expect.stringContaining("required")],
	]);
	expect(validateCustomValues([def("text", { key: "tostring" })], {})).toEqual({
		values: {},
		errors: {},
	});
});
