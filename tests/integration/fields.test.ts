import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { contact, event } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as fields from "#/modules/fields/fields.server";
import type { CreateFieldInput } from "#/modules/fields/schema";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Custom field definitions and the values the server accepts on records.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });

const field = (patch: Partial<CreateFieldInput> = {}): CreateFieldInput => ({
	objectKey: "contact",
	type: "text",
	label: { en: "Field", es: "Campo" },
	help: { en: "", es: "" },
	options: [],
	required: false,
	unique: false,
	groupId: "",
	...patch,
});

const contactInput = (custom?: Record<string, unknown>): ContactInput => ({
	firstName: "Cora",
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "",
	emailConsent: "unknown",
	custom,
});

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

async function storedCustom(id: string) {
	const [row] = await db
		.select({ custom: contact.custom })
		.from(contact)
		.where(eq(contact.id, id));
	return row.custom;
}

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("fa"), createWorkspace("fb")]);
});

afterAll(cleanup);

describe("definitions", () => {
	test("keys come from the label and stay unique; B can't see or change A's fields", async () => {
		const one = await fields.createField(
			a.workspaceId,
			actorA(),
			field({ label: { en: "Member level", es: "" } }),
		);
		const two = await fields.createField(
			a.workspaceId,
			actorA(),
			field({ label: { en: "Member level", es: "" } }),
		);
		expect(one.key).toBe("member_level");
		expect(two.key).toBe("member_level_2");

		const listB = await fields.listFields(b.workspaceId, "contact", {
			includeArchived: true,
		});
		expect(listB.fields.some((f) => f.id === one.id)).toBe(false);
		expect(
			await status(
				fields.updateField(b.workspaceId, actorB(), {
					id: one.id,
					label: { en: "Hijacked", es: "" },
					help: { en: "", es: "" },
					options: [],
					required: false,
					unique: false,
					groupId: "",
				}),
			),
		).toBe(404);
		expect(
			await status(
				fields.setFieldArchived(b.workspaceId, actorB(), one.id, true),
			),
		).toBe(404);
		// B can't put its field in A's group
		const groupA = await fields.createGroup(a.workspaceId, actorA(), {
			objectKey: "contact",
			label: { en: "A only", es: "" },
		});
		expect(
			await status(
				fields.createField(
					b.workspaceId,
					actorB(),
					field({ groupId: groupA.id }),
				),
			),
		).toBe(400);
		// Reordering ignores ids from another workspace
		const moved = await fields.reorder(b.workspaceId, "field", "contact", [
			one.id,
			two.id,
		]);
		expect(moved.count).toBe(0);
	});
});

describe("values on records", () => {
	test("the server validates values against the definitions, whatever the client sends", async () => {
		const amount = await fields.createField(
			a.workspaceId,
			actorA(),
			field({ type: "money", label: { en: "Budget", es: "" } }),
		);
		const level = await fields.createField(
			a.workspaceId,
			actorA(),
			field({
				type: "single_choice",
				label: { en: "Tier", es: "" },
				options: [{ value: "gold", label: { en: "Gold", es: "Oro" } }],
			}),
		);
		// Wrong types and unknown options are refused
		expect(
			await status(
				contacts.createContact(
					a.workspaceId,
					actorA(),
					contactInput({ [amount.key]: "lots" }),
				),
			),
		).toBe(400);
		expect(
			await status(
				contacts.createContact(
					a.workspaceId,
					actorA(),
					contactInput({ [level.key]: "platinum" }),
				),
			),
		).toBe(400);
		// Valid values are stored; unknown keys are dropped
		const { id } = await contacts.createContact(
			a.workspaceId,
			actorA(),
			contactInput({
				[amount.key]: 150_000,
				[level.key]: "gold",
				not_a_field: "x",
			}),
		);
		const custom = await storedCustom(id);
		expect(custom[amount.key]).toBe(150_000);
		expect(custom[level.key]).toBe("gold");
		expect("not_a_field" in custom).toBe(false);
	});

	test("required and unique fields are enforced per workspace", async () => {
		const code = await fields.createField(
			a.workspaceId,
			actorA(),
			field({
				label: { en: "Member code", es: "" },
				required: true,
				unique: true,
			}),
		);
		expect(
			await status(
				contacts.createContact(a.workspaceId, actorA(), contactInput({})),
			),
		).toBe(400);
		await contacts.createContact(
			a.workspaceId,
			actorA(),
			contactInput({ [code.key]: "M-001" }),
		);
		expect(
			await status(
				contacts.createContact(
					a.workspaceId,
					actorA(),
					contactInput({ [code.key]: "m-001" }),
				),
			),
		).toBe(409);
		// Same field and value in another workspace are unrelated
		const codeB = await fields.createField(
			b.workspaceId,
			actorB(),
			field({ label: { en: "Member code", es: "" }, unique: true }),
		);
		expect(
			await status(
				contacts.createContact(
					b.workspaceId,
					actorB(),
					contactInput({ [codeB.key]: "M-001" }),
				),
			),
		).toBe(200);
		// Archive it so later tests can create contacts without it
		await fields.setFieldArchived(a.workspaceId, actorA(), code.id, true);
	});

	test("archiving a field hides it but keeps its values; restoring brings them back", async () => {
		const notes = await fields.createField(
			a.workspaceId,
			actorA(),
			field({ label: { en: "Hobby", es: "" } }),
		);
		const { id } = await contacts.createContact(
			a.workspaceId,
			actorA(),
			contactInput({ [notes.key]: "Chess" }),
		);
		await fields.setFieldArchived(a.workspaceId, actorA(), notes.id, true);
		// Saving the record without the archived field keeps the old value
		await contacts.updateContact(a.workspaceId, actorA(), id, {
			...contactInput({}),
			jobTitle: "Coach",
		});
		expect((await storedCustom(id))[notes.key]).toBe("Chess");
		await fields.setFieldArchived(a.workspaceId, actorA(), notes.id, false);
		const active = await fields.listFields(a.workspaceId, "contact", {
			includeArchived: false,
		});
		expect(active.fields.some((f) => f.id === notes.id)).toBe(true);
		expect((await storedCustom(id))[notes.key]).toBe("Chess");
	});

	test("an option in use can't be removed; changes are on the timeline by field key", async () => {
		const plan = await fields.createField(
			a.workspaceId,
			actorA(),
			field({
				type: "single_choice",
				label: { en: "Plan", es: "" },
				options: [
					{ value: "basic", label: { en: "Basic", es: "" } },
					{ value: "pro", label: { en: "Pro", es: "" } },
				],
			}),
		);
		const { id } = await contacts.createContact(
			a.workspaceId,
			actorA(),
			contactInput({ [plan.key]: "basic" }),
		);
		const update = (
			options: { value: string; label: { en: string; es: string } }[],
		) =>
			fields.updateField(a.workspaceId, actorA(), {
				id: plan.id,
				label: { en: "Plan", es: "" },
				help: { en: "", es: "" },
				options,
				required: false,
				unique: false,
				groupId: "",
			});
		expect(
			await status(update([{ value: "pro", label: { en: "Pro", es: "" } }])),
		).toBe(409);
		// Renaming the option (same value) is fine
		expect(
			await status(
				update([
					{ value: "basic", label: { en: "Starter", es: "Inicial" } },
					{ value: "pro", label: { en: "Pro", es: "" } },
				]),
			),
		).toBe(200);

		await contacts.updateContact(
			a.workspaceId,
			actorA(),
			id,
			contactInput({ [plan.key]: "pro" }),
		);
		const [updated] = await db
			.select({ payload: event.payload })
			.from(event)
			.where(and(eq(event.subjectId, id), eq(event.type, "contact.updated")));
		expect(updated.payload).toEqual({
			changes: { [`custom.${plan.key}`]: { from: "basic", to: "pro" } },
		});
	});
});
