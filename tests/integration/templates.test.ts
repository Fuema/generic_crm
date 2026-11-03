import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#/db/index";
import { fieldDefinition } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import * as fields from "#/modules/fields/fields.server";
import * as pipelines from "#/modules/pipelines/pipelines.server";
import * as templates from "#/modules/templates/templates.server";
import * as views from "#/modules/views/views.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Applying the Generic template adds only what's missing, once.
let a: Workspace;
let b: Workspace;

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("ta"), createWorkspace("tb")]);
});

afterAll(cleanup);

test("a new workspace gets the fields, groups and shared views; a second run adds nothing", async () => {
	expect(await templates.templateStatus(a.workspaceId)).toEqual({
		fieldsMissing: 8,
		viewsMissing: 3,
		pipelinesMissing: 1,
	});
	const first = await templates.applyTemplate(a.workspaceId, a.userId);
	expect(first).toEqual({ groups: 2, fields: 8, views: 3, pipelines: 1 });
	expect(await templates.templateStatus(a.workspaceId)).toEqual({
		fieldsMissing: 0,
		viewsMissing: 0,
		pipelinesMissing: 0,
	});
	expect(await templates.applyTemplate(a.workspaceId, a.userId)).toEqual({
		groups: 0,
		fields: 0,
		views: 0,
		pipelines: 0,
	});

	// The Sales pipeline, with its stages in order
	const [sales] = await pipelines.listPipelines(a.workspaceId, {
		includeArchived: false,
	});
	expect(sales.key).toBe("sales");
	expect(sales.stages.map((s) => [s.name.en, s.probability, s.type])).toEqual([
		["New lead", 10, "open"],
		["Qualified", 25, "open"],
		["Proposal sent", 50, "open"],
		["Negotiation", 75, "open"],
		["Won", 100, "won"],
		["Lost", 0, "lost"],
	]);

	const contactFields = await fields.listFields(a.workspaceId, "contact", {
		includeArchived: false,
	});
	expect(contactFields.fields.map((f) => f.key).sort()).toEqual([
		"birthday",
		"linkedin",
		"preferred_contact",
		"source",
	]);
	expect(contactFields.groups.map((g) => g.label.en)).toEqual(["Profile"]);

	// The views are shared and their filters run
	const list = await views.listViews(a.workspaceId, a.userId, "contact", false);
	expect(list.every((v) => v.shared)).toBe(true);
	for (const v of list) {
		const result = await contacts.listContacts(a.workspaceId, {
			page: 1,
			pageSize: 10,
			q: "",
			sort: v.config.sort.field,
			dir: v.config.sort.dir,
			show: "active",
			filters: v.config.filters,
		});
		expect(result.total).toBeGreaterThanOrEqual(0);
	}
	// Another workspace is untouched
	expect(await templates.templateStatus(b.workspaceId)).toEqual({
		fieldsMissing: 8,
		viewsMissing: 3,
		pipelinesMissing: 1,
	});
});

test("existing keys are respected, even when archived", async () => {
	const mine = await fields.createField(
		b.workspaceId,
		{ type: "member", id: b.userId },
		{
			objectKey: "contact",
			type: "text",
			label: { en: "Source", es: "" },
			help: { en: "", es: "" },
			options: [],
			required: false,
			unique: false,
			groupId: "",
		},
	);
	expect(mine.key).toBe("source");
	await fields.setFieldArchived(
		b.workspaceId,
		{ type: "member", id: b.userId },
		mine.id,
		true,
	);
	const added = await templates.applyTemplate(b.workspaceId, b.userId);
	expect(added.fields).toBe(7);
	// The workspace's own "source" field is unchanged: still a text field, still archived
	const [row] = await db
		.select()
		.from(fieldDefinition)
		.where(eq(fieldDefinition.id, mine.id));
	expect(row.type).toBe("text");
	expect(row.archivedAt).not.toBeNull();
});
