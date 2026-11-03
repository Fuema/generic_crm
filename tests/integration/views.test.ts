import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "#/db/index";
import { member, user } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput, ContactSearch } from "#/modules/contacts/schema";
import * as fields from "#/modules/fields/fields.server";
import type { CreateFieldInput } from "#/modules/fields/schema";
import * as records from "#/modules/records/records.server";
import type { Filter, ViewConfig } from "#/modules/views/schema";
import * as views from "#/modules/views/views.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Filters on real data, and who can see and change saved views.
let a: Workspace;
let b: Workspace;
let colleagueId: string; // a second member of workspace A
const actorA = () => ({ type: "member" as const, id: a.userId });
const keys: Record<string, string> = {};
const ids: Record<string, string> = {};

const field = (patch: Partial<CreateFieldInput>): CreateFieldInput => ({
	objectKey: "contact",
	type: "text",
	label: { en: "F", es: "" },
	help: { en: "", es: "" },
	options: [],
	required: false,
	unique: false,
	groupId: "",
	...patch,
});

const contactInput = (
	firstName: string,
	patch: Partial<ContactInput> = {},
): ContactInput => ({
	firstName,
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "",
	emailConsent: "unknown",
	...patch,
});

const search = (
	filters: Filter[],
	sort = "name",
	dir: "asc" | "desc" = "asc",
): ContactSearch => ({
	page: 1,
	pageSize: 100,
	q: "",
	sort,
	dir,
	show: "active",
	filters,
});

async function names(filters: Filter[], sort?: string, dir?: "asc" | "desc") {
	const list = await contacts.listContacts(
		a.workspaceId,
		search(filters, sort, dir),
	);
	return list.rows.map((r) => r.firstName);
}

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("va"), createWorkspace("vb")]);
	colleagueId = crypto.randomUUID();
	const now = new Date();
	await db.insert(user).values({
		id: colleagueId,
		name: "Colleague",
		email: `it-colleague-${colleagueId.slice(0, 8)}@example.com`,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(member).values({
		id: crypto.randomUUID(),
		organizationId: a.workspaceId,
		userId: colleagueId,
		role: "editor",
		createdAt: now,
	});

	const make = async (name: string, f: Partial<CreateFieldInput>) => {
		const created = await fields.createField(
			a.workspaceId,
			actorA(),
			field({ ...f, label: { en: name, es: "" } }),
		);
		keys[name] = created.key;
	};
	await make("Budget", { type: "money" });
	await make("Since", { type: "date" });
	await make("Vip", { type: "checkbox" });
	await make("Plan", {
		type: "single_choice",
		options: [
			{ value: "basic", label: { en: "Basic", es: "" } },
			{ value: "pro", label: { en: "Pro", es: "" } },
		],
	});
	await make("Topics", {
		type: "multiple_choice",
		options: [
			{ value: "sales", label: { en: "Sales", es: "" } },
			{ value: "support", label: { en: "Support", es: "" } },
		],
	});
	await make("Notes", { type: "text" });

	const add = async (
		name: string,
		custom: Record<string, unknown>,
		patch: Partial<ContactInput> = {},
	) => {
		ids[name] = (
			await contacts.createContact(a.workspaceId, actorA(), {
				...contactInput(name, patch),
				custom,
			})
		).id;
	};
	await add(
		"Ana",
		{
			[keys.Budget]: 50_000,
			[keys.Since]: "2023-05-01",
			[keys.Vip]: true,
			[keys.Plan]: "pro",
			[keys.Topics]: ["sales"],
			[keys.Notes]: "Prefers email",
		},
		{ lifecycleStage: "customer" },
	);
	await add("Ben", {
		[keys.Budget]: 5_000,
		[keys.Since]: "2025-02-10",
		[keys.Plan]: "basic",
		[keys.Topics]: ["support", "sales"],
	});
	await add(
		"Cleo",
		{ [keys.Vip]: false, [keys.Topics]: ["support"] },
		{ lifecycleStage: "qualified" },
	);
	await add("Dan", {});
	await records.addTag(a.workspaceId, actorA(), {
		subjectType: "contact",
		subjectId: ids.Dan,
		name: "Hot",
	});
});

afterAll(cleanup);

describe("filters", () => {
	test("custom fields of every kind filter on the server", async () => {
		expect(
			await names([
				{ field: `custom.${keys.Budget}`, op: "gt", value: 10_000 },
			]),
		).toEqual(["Ana"]);
		expect(
			await names([
				{
					field: `custom.${keys.Budget}`,
					op: "between",
					value: [1_000, 60_000],
				},
			]),
		).toEqual(["Ana", "Ben"]);
		expect(
			await names([
				{ field: `custom.${keys.Since}`, op: "lt", value: "2024-01-01" },
			]),
		).toEqual(["Ana"]);
		expect(
			await names([{ field: `custom.${keys.Vip}`, op: "is_true" }]),
		).toEqual(["Ana"]);
		expect(
			await names([{ field: `custom.${keys.Vip}`, op: "is_false" }]),
		).toEqual(["Ben", "Cleo", "Dan"]);
		expect(
			await names([
				{ field: `custom.${keys.Plan}`, op: "any_of", value: ["basic"] },
			]),
		).toEqual(["Ben"]);
		expect(
			await names([
				{ field: `custom.${keys.Topics}`, op: "any_of", value: ["support"] },
			]),
		).toEqual(["Ben", "Cleo"]);
		expect(
			await names([
				{ field: `custom.${keys.Notes}`, op: "contains", value: "EMAIL" },
			]),
		).toEqual(["Ana"]);
		expect(
			await names([{ field: `custom.${keys.Plan}`, op: "is_empty" }]),
		).toEqual(["Cleo", "Dan"]);
	});

	test("built-in fields filter too, and all filters must match", async () => {
		expect(
			await names([
				{
					field: "lifecycleStage",
					op: "any_of",
					value: ["customer", "qualified"],
				},
			]),
		).toEqual(["Ana", "Cleo"]);
		expect(await names([{ field: "tag", op: "not_empty" }])).toEqual(["Dan"]);
		expect(
			await names([
				{ field: `custom.${keys.Topics}`, op: "any_of", value: ["sales"] },
				{ field: "lifecycleStage", op: "any_of", value: ["lead"] },
			]),
		).toEqual(["Ben"]);
	});

	test("custom fields sort, with empty values last", async () => {
		expect(await names([], `custom.${keys.Budget}`, "desc")).toEqual(
			// Ties (no budget) keep creation order
			["Ana", "Ben", "Cleo", "Dan"],
		);
		expect(
			(await names([], `custom.${keys.Budget}`, "asc")).slice(0, 2),
		).toEqual(["Ben", "Ana"]);
	});

	test("invalid filters are refused, and another workspace's fields don't exist", async () => {
		expect(
			await status(
				contacts.listContacts(
					a.workspaceId,
					search([
						{ field: `custom.${keys.Budget}`, op: "contains", value: "x" },
					]),
				),
			),
		).toBe(400);
		expect(
			await status(
				contacts.listContacts(
					a.workspaceId,
					search([{ field: "password", op: "is_empty" }]),
				),
			),
		).toBe(400);
		// B has no such field: the same filter is unknown there
		expect(
			await status(
				contacts.listContacts(
					b.workspaceId,
					search([{ field: `custom.${keys.Budget}`, op: "gt", value: 1 }]),
				),
			),
		).toBe(400);
	});
});

describe("saved views", () => {
	const config: ViewConfig = {
		filters: [{ field: "lifecycleStage", op: "any_of", value: ["customer"] }],
		columns: ["email", "not-a-column", "lifecycleStage"],
		sort: { field: "name", dir: "asc" },
	};

	test("private views are only visible to their creator; shared ones to the workspace", async () => {
		const priv = await views.createView(a.workspaceId, a.userId, {
			objectKey: "contact",
			name: "Mine",
			shared: false,
			config,
		});
		const pub = await views.createView(a.workspaceId, a.userId, {
			objectKey: "contact",
			name: "Team",
			shared: true,
			config,
		});
		const forColleague = await views.listViews(
			a.workspaceId,
			colleagueId,
			"contact",
			false,
		);
		expect(forColleague.map((v) => v.id)).toEqual([pub.id]);
		const forB = await views.listViews(
			b.workspaceId,
			b.userId,
			"contact",
			true,
		);
		expect(forB.some((v) => v.id === priv.id || v.id === pub.id)).toBe(false);
		// Unknown columns were dropped when saving
		const mine = (
			await views.listViews(a.workspaceId, a.userId, "contact", false)
		).find((v) => v.id === priv.id);
		expect(mine?.config.columns).toEqual(["email", "lifecycleStage"]);
	});

	test("only the creator, or an owner/admin for shared views, can change a view", async () => {
		const priv = await views.createView(a.workspaceId, a.userId, {
			objectKey: "contact",
			name: "Private",
			shared: false,
			config,
		});
		const pub = await views.createView(a.workspaceId, a.userId, {
			objectKey: "contact",
			name: "Shared",
			shared: true,
			config,
		});
		// A colleague can't see the private view at all, and can't change the shared one
		expect(
			await status(
				views.updateView(a.workspaceId, colleagueId, false, {
					id: priv.id,
					name: "x",
				}),
			),
		).toBe(404);
		expect(
			await status(
				views.updateView(a.workspaceId, colleagueId, false, {
					id: pub.id,
					name: "x",
				}),
			),
		).toBe(403);
		expect(
			await status(views.deleteView(a.workspaceId, colleagueId, false, pub.id)),
		).toBe(403);
		// An admin can change the shared view, not someone else's private one
		expect(
			await status(
				views.updateView(a.workspaceId, colleagueId, true, {
					id: pub.id,
					name: "Renamed",
				}),
			),
		).toBe(200);
		expect(
			await status(views.deleteView(a.workspaceId, colleagueId, true, priv.id)),
		).toBe(404);
		// Another workspace can't touch either
		expect(
			await status(views.deleteView(b.workspaceId, b.userId, true, pub.id)),
		).toBe(404);
	});

	test("a view with an invalid filter isn't saved", async () => {
		expect(
			await status(
				views.createView(a.workspaceId, a.userId, {
					objectKey: "contact",
					name: "Broken",
					shared: false,
					config: {
						...config,
						filters: [{ field: "custom.nope", op: "is_empty" }],
					},
				}),
			),
		).toBe(400);
	});
});
