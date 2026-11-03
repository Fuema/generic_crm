import { describe, expect, test } from "bun:test";
import {
	customFromText,
	guessMapping,
	stageFromText,
} from "#/modules/csv/columns";
import { parseCsv, toCsv } from "#/modules/csv/csv";
import type { FieldDef } from "#/modules/fields/schema";

const def = (
	key: string,
	type: string,
	patch: Partial<FieldDef> = {},
): FieldDef => ({
	id: "00000000-0000-7000-8000-000000000001",
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

describe("parseCsv", () => {
	test("quotes, separators, quotes inside quotes and line breaks", () => {
		const text =
			'name,notes\r\n"García, Ana","She said ""hi""\nsecond line"\r\nBen,\r\n\r\n';
		expect(parseCsv(text)).toEqual([
			["name", "notes"],
			["García, Ana", 'She said "hi"\nsecond line'],
			["Ben", ""],
		]);
	});

	test("Spanish Excel files: BOM and semicolons", () => {
		expect(parseCsv("﻿Nombre;Correo\nAna;ana@example.com\n")).toEqual([
			["Nombre", "Correo"],
			["Ana", "ana@example.com"],
		]);
	});
});

describe("toCsv", () => {
	test("escapes and neutralizes formulas, round-trips through parseCsv", () => {
		const csv = toCsv([
			["a", "b"],
			['x, "y"', "=HYPERLINK(1)"],
			["-5", "@cmd"],
		]);
		expect(csv.startsWith("﻿")).toBe(true);
		expect(parseCsv(csv)).toEqual([
			["a", "b"],
			['x, "y"', "'=HYPERLINK(1)"],
			["'-5", "'@cmd"],
		]);
	});
});

describe("columns and values", () => {
	test("headers are recognised in English and Spanish", () => {
		const defs = [
			def("membership", "text", {
				label: { en: "Membership", es: "Membresía" },
			}),
		];
		expect(
			guessMapping(
				"contact",
				[
					"Nombre",
					"Apellidos",
					"Correo electrónico",
					"Empresa",
					"Membresía",
					"Whatever",
				],
				defs,
			),
		).toEqual([
			"firstName",
			"lastName",
			"email",
			"company",
			"custom.membership",
			"",
		]);
	});

	test("values parse from either language", () => {
		expect(stageFromText("Cliente")).toBe("customer");
		expect(stageFromText("qualified")).toBe("qualified");
		expect(stageFromText("VIP")).toBeUndefined();
		expect(customFromText(def("fee", "money"), "1,250.50")).toBe(125_050);
		expect(customFromText(def("fee", "money"), "€ 99,90")).toBe(9_990);
		expect(customFromText(def("ok", "checkbox"), "Sí")).toBe(true);
		const plan = def("plan", "single_choice", {
			options: [{ value: "gold", label: { en: "Gold", es: "Oro" } }],
		});
		expect(customFromText(plan, "oro")).toBe("gold");
		expect(customFromText(plan, "Platinum")).toBe("Platinum"); // left for validation to reject
	});
});
