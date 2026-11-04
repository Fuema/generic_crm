import { expect, test } from "bun:test";
import {
	projectInputSchema,
	projectSearchSchema,
} from "#/modules/projects/schema";

const valid = {
	name: "Website",
	description: "",
	status: "planned",
	startDate: "2026-11-01",
	dueDate: "2026-12-15",
	ownerId: "",
	contactId: "",
	companyId: "",
};

test("a project needs a name; contact and company are optional", () => {
	expect(projectInputSchema.safeParse(valid).success).toBe(true);
	expect(projectInputSchema.safeParse({ ...valid, name: " " }).success).toBe(
		false,
	);
});

test("the due date can't be before the start; days must exist", () => {
	expect(
		projectInputSchema.safeParse({ ...valid, dueDate: "2026-10-01" }).success,
	).toBe(false);
	expect(
		projectInputSchema.safeParse({ ...valid, dueDate: "2026-02-30" }).success,
	).toBe(false);
	expect(
		projectInputSchema.safeParse({ ...valid, startDate: "", dueDate: "" })
			.success,
	).toBe(true);
});

test("statuses are fixed; the list search falls back to safe defaults", () => {
	expect(
		projectInputSchema.safeParse({ ...valid, status: "done" }).success,
	).toBe(false);
	const parsed = projectSearchSchema.parse({ status: "done", show: "x" });
	expect([parsed.status, parsed.show]).toEqual([undefined, "active"]);
});
