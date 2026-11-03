import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { contact, event, note, recordTag } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as fields from "#/modules/fields/fields.server";
import type { CreateFieldInput } from "#/modules/fields/schema";
import * as records from "#/modules/records/records.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Merging duplicate contacts (spec §6.2): values, notes, tags, uniqueness,
// events, and workspace isolation.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });
const RUN = crypto.randomUUID().slice(0, 8);

const input = (patch: Partial<ContactInput> = {}): ContactInput => ({
	firstName: "Ana",
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

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

async function row(id: string) {
	const [r] = await db.select().from(contact).where(eq(contact.id, id));
	return r;
}

function mergedEvents(subjectId: string) {
	return db
		.select({ payload: event.payload })
		.from(event)
		.where(
			and(
				eq(event.subjectType, "contact"),
				eq(event.subjectId, subjectId),
				eq(event.type, "contact.merged"),
			),
		);
}

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("ma"), createWorkspace("mb")]);
});
afterAll(cleanup);

describe("mergeContacts", () => {
	test("merges values, moves notes and tags, keeps uniqueness, archives the duplicate", async () => {
		const code = await fields.createField(
			a.workspaceId,
			actorA(),
			field({ label: { en: "Code", es: "Código" }, unique: true }),
		);
		const level = await fields.createField(
			a.workspaceId,
			actorA(),
			field({ label: { en: "Level", es: "Nivel" } }),
		);
		const keep = await contacts.createContact(
			a.workspaceId,
			actorA(),
			input({ phone: "111", custom: { [level.key]: "gold" } }),
		);
		const dup = await contacts.createContact(
			a.workspaceId,
			actorA(),
			input({
				firstName: "Anna",
				email: `ana-${RUN}@example.com`,
				phone: "222",
				jobTitle: "CEO",
				custom: { [code.key]: `C-${RUN}`, [level.key]: "silver" },
			}),
		);
		const subject = (id: string) => ({
			subjectType: "contact" as const,
			subjectId: id,
		});
		await records.addTag(a.workspaceId, actorA(), {
			...subject(keep.id),
			name: `shared-${RUN}`,
		});
		await records.addTag(a.workspaceId, actorA(), {
			...subject(dup.id),
			name: `shared-${RUN}`,
		});
		await records.addTag(a.workspaceId, actorA(), {
			...subject(dup.id),
			name: `only-${RUN}`,
		});
		await records.createNote(a.workspaceId, actorA(), {
			...subject(dup.id),
			body: "From the duplicate",
		});

		const result = await contacts.mergeContacts(a.workspaceId, actorA(), {
			keepId: keep.id,
			duplicateId: dup.id,
			choices: { phone: "duplicate" },
		});
		expect(result).toEqual({ id: keep.id, notesMoved: 1, tagsMoved: 1 });

		const kept = await row(keep.id);
		expect(kept.firstName).toBe("Ana"); // conflict, default keeps
		expect(kept.phone).toBe("222"); // chosen from the duplicate
		expect(kept.jobTitle).toBe("CEO"); // empty on the kept side
		expect(kept.email).toBe(`ana-${RUN}@example.com`);
		expect(kept.custom).toEqual({
			[code.key]: `C-${RUN}`,
			[level.key]: "gold",
		});
		expect(kept.archivedAt).toBeNull();

		const gone = await row(dup.id);
		expect(gone.archivedAt).not.toBeNull();
		expect(gone.email).toBeNull(); // given up to the kept contact
		expect(gone.custom).toEqual({ [level.key]: "silver" });

		const notes = await db
			.select()
			.from(note)
			.where(eq(note.subjectId, keep.id));
		expect(notes.map((n) => n.body)).toEqual(["From the duplicate"]);
		const tagsKept = await db
			.select()
			.from(recordTag)
			.where(eq(recordTag.subjectId, keep.id));
		expect(tagsKept).toHaveLength(2);
		const tagsGone = await db
			.select()
			.from(recordTag)
			.where(eq(recordTag.subjectId, dup.id));
		expect(tagsGone).toHaveLength(0);

		const [onKeep] = await mergedEvents(keep.id);
		expect(onKeep.payload).toMatchObject({ role: "kept", otherId: dup.id });
		const [onDup] = await mergedEvents(dup.id);
		expect(onDup.payload).toMatchObject({
			role: "duplicate",
			otherId: keep.id,
			cleared: ["email", `custom.${code.key}`],
		});

		// The email and unique code are free for nobody else: the kept contact holds them
		expect(
			await status(
				contacts.createContact(
					a.workspaceId,
					actorA(),
					input({ email: `ANA-${RUN}@example.com` }),
				),
			),
		).toBe(409);
	});

	test("refuses archived contacts, itself, and the tag limit", async () => {
		const one = await contacts.createContact(a.workspaceId, actorA(), input());
		const two = await contacts.createContact(a.workspaceId, actorA(), input());
		expect(
			await status(
				contacts.mergeContacts(a.workspaceId, actorA(), {
					keepId: one.id,
					duplicateId: one.id,
					choices: {},
				}),
			),
		).toBe(400);

		for (let i = 0; i < 11; i++) {
			await records.addTag(a.workspaceId, actorA(), {
				subjectType: "contact",
				subjectId: one.id,
				name: `k${i}-${RUN}`,
			});
			await records.addTag(a.workspaceId, actorA(), {
				subjectType: "contact",
				subjectId: two.id,
				name: `d${i}-${RUN}`,
			});
		}
		expect(
			await status(
				contacts.mergeContacts(a.workspaceId, actorA(), {
					keepId: one.id,
					duplicateId: two.id,
					choices: {},
				}),
			),
		).toBe(409);
		expect((await row(two.id)).archivedAt).toBeNull();

		await contacts.setContactArchived(a.workspaceId, actorA(), two.id, true);
		expect(
			await status(
				contacts.mergeContacts(a.workspaceId, actorA(), {
					keepId: one.id,
					duplicateId: two.id,
					choices: {},
				}),
			),
		).toBe(409);
	}, 30_000); // 22 tags added one request at a time

	test("two opposite merges at once: exactly one wins", async () => {
		const x = await contacts.createContact(a.workspaceId, actorA(), input());
		const y = await contacts.createContact(a.workspaceId, actorA(), input());
		const results = await Promise.all([
			status(
				contacts.mergeContacts(a.workspaceId, actorA(), {
					keepId: x.id,
					duplicateId: y.id,
					choices: {},
				}),
			),
			status(
				contacts.mergeContacts(a.workspaceId, actorA(), {
					keepId: y.id,
					duplicateId: x.id,
					choices: {},
				}),
			),
		]);
		expect(results.sort()).toEqual([200, 409]);
		const archived = [await row(x.id), await row(y.id)].filter(
			(r) => r.archivedAt,
		);
		expect(archived).toHaveLength(1);
	});

	test("never merges or finds across workspaces", async () => {
		const mine = await contacts.createContact(
			a.workspaceId,
			actorA(),
			input({ firstName: `Iso-${RUN}` }),
		);
		const theirs = await contacts.createContact(
			b.workspaceId,
			actorB(),
			input({ firstName: `Iso-${RUN}` }),
		);
		expect(
			await status(
				contacts.mergeContacts(b.workspaceId, actorB(), {
					keepId: theirs.id,
					duplicateId: mine.id,
					choices: {},
				}),
			),
		).toBe(404);
		expect(
			await status(
				contacts.mergeContacts(a.workspaceId, actorA(), {
					keepId: theirs.id,
					duplicateId: mine.id,
					choices: {},
				}),
			),
		).toBe(404);
		expect((await row(mine.id)).archivedAt).toBeNull();
		expect((await row(theirs.id)).archivedAt).toBeNull();

		const found = await contacts.searchMergeCandidates(
			b.workspaceId,
			theirs.id,
			`Iso-${RUN}`,
		);
		expect(found).toEqual([]);
		const foundA = await contacts.searchMergeCandidates(
			a.workspaceId,
			theirs.id,
			`Iso-${RUN}`,
		);
		expect(foundA.map((c) => c.id)).toEqual([mine.id]);
	});
});
