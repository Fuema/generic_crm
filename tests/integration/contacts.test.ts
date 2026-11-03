import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event, member } from "#/db/schema";
import * as data from "#/modules/contacts/contacts.server";
import type { CompanyInput, ContactInput } from "#/modules/contacts/schema";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// The data layer of contacts and companies, called the way the server functions
// call it (workspace id first). Workspace A must never see or touch B's records.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });

const contactInput = (patch: Partial<ContactInput> = {}): ContactInput => ({
	firstName: "Ana",
	lastName: "García",
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

const companyInput = (patch: Partial<CompanyInput> = {}): CompanyInput => ({
	name: "Acme",
	domain: "",
	phone: "",
	city: "",
	country: "",
	ownerId: "",
	...patch,
});

const searchAll = {
	page: 1,
	pageSize: 100,
	q: "",
	sort: "createdAt" as const,
	dir: "desc" as const,
	show: "active" as const,
	filters: [],
};

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

function eventsFor(subjectId: string) {
	return db
		.select({
			type: event.type,
			payload: event.payload,
			actorId: event.actorId,
		})
		.from(event)
		.where(
			and(eq(event.subjectType, "contact"), eq(event.subjectId, subjectId)),
		)
		.orderBy(event.createdAt, event.id);
}

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("ca"), createWorkspace("cb")]);
});

afterAll(cleanup);

describe("contact isolation", () => {
	test("B can't list, read, edit, archive or restore A's contact", async () => {
		const { id } = await data.createContact(
			a.workspaceId,
			actorA(),
			contactInput(),
		);

		const listB = await data.listContacts(b.workspaceId, searchAll);
		expect(listB.rows.some((r) => r.id === id)).toBe(false);
		expect(await status(data.getContactDetail(b.workspaceId, id))).toBe(404);
		expect(
			await status(
				data.updateContact(
					b.workspaceId,
					actorB(),
					id,
					contactInput({ firstName: "X" }),
				),
			),
		).toBe(404);
		expect(
			await status(data.setContactArchived(b.workspaceId, actorB(), id, true)),
		).toBe(404);
		expect(
			await status(data.setContactArchived(b.workspaceId, actorB(), id, false)),
		).toBe(404);

		// A still sees it unchanged
		const detail = await data.getContactDetail(a.workspaceId, id);
		expect(detail.contact.firstName).toBe("Ana");
		expect(detail.contact.archivedAt).toBeNull();
	});

	test("a contact can't point to another workspace's company or member", async () => {
		const companyA = await data.createCompany(
			a.workspaceId,
			actorA(),
			companyInput(),
		);
		expect(
			await status(
				data.createContact(
					b.workspaceId,
					actorB(),
					contactInput({ companyId: companyA.id }),
				),
			),
		).toBe(400);
		expect(
			await status(
				data.createContact(
					b.workspaceId,
					actorB(),
					contactInput({ ownerId: a.userId }),
				),
			),
		).toBe(400);
		// The same references work inside A
		expect(
			await status(
				data.createContact(
					a.workspaceId,
					actorA(),
					contactInput({ companyId: companyA.id, ownerId: a.userId }),
				),
			),
		).toBe(200);
	});

	test("email is unique per workspace, ignoring case", async () => {
		await data.createContact(
			a.workspaceId,
			actorA(),
			contactInput({ email: "dup@example.com" }),
		);
		expect(
			await status(
				data.createContact(
					a.workspaceId,
					actorA(),
					contactInput({ email: "DUP@example.com" }),
				),
			),
		).toBe(409);
		expect(
			await status(
				data.createContact(
					b.workspaceId,
					actorB(),
					contactInput({ email: "dup@example.com" }),
				),
			),
		).toBe(200);
	});
});

describe("company isolation", () => {
	test("B can't read, edit or archive A's company, and counts stay separate", async () => {
		const { id } = await data.createCompany(
			a.workspaceId,
			actorA(),
			companyInput({ name: "Globex" }),
		);
		await data.createContact(
			a.workspaceId,
			actorA(),
			contactInput({ companyId: id }),
		);

		expect(await status(data.getCompanyDetail(b.workspaceId, id))).toBe(404);
		expect(
			await status(
				data.updateCompany(
					b.workspaceId,
					actorB(),
					id,
					companyInput({ name: "X" }),
				),
			),
		).toBe(404);
		expect(
			await status(data.setCompanyArchived(b.workspaceId, actorB(), id, true)),
		).toBe(404);

		const listA = await data.listCompanies(a.workspaceId, {
			...searchAll,
			sort: "name",
		});
		expect(listA.rows.find((r) => r.id === id)?.contactCount).toBe(1);
		const listB = await data.listCompanies(b.workspaceId, {
			...searchAll,
			sort: "name",
		});
		expect(listB.rows.some((r) => r.id === id)).toBe(false);
	});

	test("domain is unique per workspace, ignoring case", async () => {
		await data.createCompany(
			a.workspaceId,
			actorA(),
			companyInput({ domain: "initech.com" }),
		);
		expect(
			await status(
				data.createCompany(
					a.workspaceId,
					actorA(),
					companyInput({ domain: "INITECH.com" }),
				),
			),
		).toBe(409);
		expect(
			await status(
				data.createCompany(
					b.workspaceId,
					actorB(),
					companyInput({ domain: "initech.com" }),
				),
			),
		).toBe(200);
	});
});

describe("references over time", () => {
	test("a record whose owner left the workspace can still be edited", async () => {
		const { id } = await data.createContact(
			a.workspaceId,
			actorA(),
			contactInput({ ownerId: a.userId }),
		);
		const co = await data.createCompany(
			a.workspaceId,
			actorA(),
			companyInput({ name: "Left Inc", ownerId: a.userId }),
		);
		// The owner leaves: the ids stay on the records (FK is to user, not member)
		await db.delete(member).where(eq(member.userId, a.userId));
		try {
			expect(
				await status(
					data.updateContact(
						a.workspaceId,
						actorA(),
						id,
						contactInput({ ownerId: a.userId, jobTitle: "CTO" }),
					),
				),
			).toBe(200);
			expect(
				await status(
					data.updateCompany(
						a.workspaceId,
						actorA(),
						co.id,
						companyInput({ name: "Left Inc", ownerId: a.userId, city: "Lima" }),
					),
				),
			).toBe(200);
			// …but they can't be newly assigned to someone outside the workspace
			expect(
				await status(
					data.createContact(
						a.workspaceId,
						actorA(),
						contactInput({ ownerId: a.userId }),
					),
				),
			).toBe(400);
		} finally {
			await db.insert(member).values({
				id: crypto.randomUUID(),
				organizationId: a.workspaceId,
				userId: a.userId,
				role: "owner",
				createdAt: new Date(),
			});
		}
	});

	test("archived companies can't get new contacts, existing links stay editable", async () => {
		const co = await data.createCompany(
			a.workspaceId,
			actorA(),
			companyInput({ name: "Old Co" }),
		);
		const { id } = await data.createContact(
			a.workspaceId,
			actorA(),
			contactInput({ companyId: co.id }),
		);
		await data.setCompanyArchived(a.workspaceId, actorA(), co.id, true);
		expect(
			await status(
				data.createContact(
					a.workspaceId,
					actorA(),
					contactInput({ companyId: co.id }),
				),
			),
		).toBe(400);
		expect(
			await status(
				data.updateContact(
					a.workspaceId,
					actorA(),
					id,
					contactInput({ companyId: co.id, phone: "+34 600 000 000" }),
				),
			),
		).toBe(200);
	});

	test("two simultaneous creates with the same email: one wins, one gets 409", async () => {
		const results = await Promise.all(
			[1, 2, 3].map(() =>
				status(
					data.createContact(
						a.workspaceId,
						actorA(),
						contactInput({ email: "race@example.com" }),
					),
				),
			),
		);
		expect(results.filter((r) => r === 200)).toHaveLength(1);
		expect(results.filter((r) => r === 409)).toHaveLength(2);
	});
});

describe("list columns", () => {
	test("lists show the owner's name and the company's contact count", async () => {
		const co = await data.createCompany(
			a.workspaceId,
			actorA(),
			companyInput({ name: "Umbrella", ownerId: a.userId }),
		);
		const { id } = await data.createContact(
			a.workspaceId,
			actorA(),
			contactInput({ firstName: "Owned", companyId: co.id, ownerId: a.userId }),
		);
		const contacts = await data.listContacts(a.workspaceId, searchAll);
		const row = contacts.rows.find((r) => r.id === id);
		expect(row?.ownerName).toBe("Test ca");
		expect(row?.companyName).toBe("Umbrella");
		const companies = await data.listCompanies(a.workspaceId, {
			...searchAll,
			sort: "name",
		});
		const companyRow = companies.rows.find((r) => r.id === co.id);
		expect(companyRow?.ownerName).toBe("Test ca");
		expect(companyRow?.contactCount).toBe(1);
	});
});

describe("event log", () => {
	test("each change writes one event with who and what changed", async () => {
		const { id } = await data.createContact(
			a.workspaceId,
			actorA(),
			contactInput(),
		);
		await data.updateContact(
			a.workspaceId,
			actorA(),
			id,
			contactInput({ lifecycleStage: "customer", jobTitle: "CEO" }),
		);
		// Saving without changes writes no event
		await data.updateContact(
			a.workspaceId,
			actorA(),
			id,
			contactInput({ lifecycleStage: "customer", jobTitle: "CEO" }),
		);
		await data.setContactArchived(a.workspaceId, actorA(), id, true);
		await data.setContactArchived(a.workspaceId, actorA(), id, false);

		const events = await eventsFor(id);
		expect(events.map((e) => e.type)).toEqual([
			"contact.created",
			"contact.updated",
			"contact.archived",
			"contact.restored",
		]);
		expect(events.every((e) => e.actorId === a.userId)).toBe(true);
		expect(events[1].payload).toEqual({
			changes: {
				jobTitle: { from: null, to: "CEO" },
				lifecycleStage: { from: "lead", to: "customer" },
			},
		});
	});

	test("an archived contact can't be edited until it's restored", async () => {
		const { id } = await data.createContact(
			a.workspaceId,
			actorA(),
			contactInput(),
		);
		await data.setContactArchived(a.workspaceId, actorA(), id, true);
		expect(
			await status(
				data.updateContact(
					a.workspaceId,
					actorA(),
					id,
					contactInput({ firstName: "Z" }),
				),
			),
		).toBe(409);
		const archived = await data.listContacts(a.workspaceId, {
			...searchAll,
			show: "archived",
		});
		expect(archived.rows.some((r) => r.id === id)).toBe(true);
		const active = await data.listContacts(a.workspaceId, searchAll);
		expect(active.rows.some((r) => r.id === id)).toBe(false);
	});
});
