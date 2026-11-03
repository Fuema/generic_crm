import { expect, test } from "bun:test";
import {
	createFieldSchema,
	type FieldDef,
	OBJECT_KEYS,
} from "#/modules/fields/schema";
import { filterProblem, viewConfigSchema } from "#/modules/views/schema";
import generic from "../../templates/generic.json";

// The Generic template file must follow the same rules as fields and views
// created by hand (spec §7.5), so applying it can never fail on bad data.

test("every template field passes the field rules", () => {
	for (const objectKey of OBJECT_KEYS) {
		const groups =
			generic.objects[objectKey as keyof typeof generic.objects]?.groups ?? [];
		for (const group of groups) {
			for (const f of group.fields) {
				const parsed = createFieldSchema.safeParse({
					objectKey,
					type: f.type,
					label: f.label,
					help: "help" in f ? f.help : { en: "", es: "" },
					options: "options" in f ? f.options : [],
					required: false,
					unique: false,
					groupId: "",
				});
				expect(parsed.success).toBe(true);
				expect(f.key).toMatch(/^[a-z][a-z0-9_]{0,35}$/);
			}
		}
	}
});

test("every template view is valid against the template's own fields", () => {
	for (const view of generic.views) {
		const objectKey = view.objectKey as (typeof OBJECT_KEYS)[number];
		const defs: FieldDef[] = (
			generic.objects[objectKey as keyof typeof generic.objects]?.groups ?? []
		).flatMap((g) =>
			g.fields.map((f, i) => ({
				id: `00000000-0000-7000-8000-${String(i).padStart(12, "0")}`,
				key: f.key,
				label: f.label,
				help: null,
				type: f.type,
				options: ("options" in f ? f.options : []) as FieldDef["options"],
				required: false,
				unique: false,
				groupId: null,
				position: i,
				archivedAt: null,
			})),
		);
		const config = viewConfigSchema.parse(view.config);
		for (const filter of config.filters) {
			expect(filterProblem(objectKey, filter, defs)).toBeNull();
		}
		for (const column of config.columns.filter((c) =>
			c.startsWith("custom."),
		)) {
			expect(defs.some((d) => `custom.${d.key}` === column)).toBe(true);
		}
	}
});
