import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event, note } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as records from "#/modules/records/records.server";
import { LIMITS } from "#/modules/records/schema";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Tags, notes and the timeline: workspace A must never see or change B's, and
// every change is on the record's timeline.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });
const otherMember = { type: "member" as const, id: "not-the-author" };

const contactInput: ContactInput = {
	firstName: "Tess",
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "",
	emailConsent: "unknown",
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

const newContact = async (ws: Workspace, actor: ReturnType<typeof actorA>) =>
	(await contacts.createContact(ws.workspaceId, actor, contactInput)).id;

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("ra"), createWorkspace("rb")]);
});

afterAll(cleanup);

describe("tags", () => {
	test("names are reused case-insensitively and listed per record", async () => {
		const id = await newContact(a, actorA());
		const first = await records.addTag(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			name: "VIP",
		});
		const again = await records.addTag(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			name: "vip",
		});
		expect(again.tagId).toBe(first.tagId);
		const timeline = await records.getTimeline(a.workspaceId, "contact", id);
		expect(timeline.tags.map((t) => t.name)).toEqual(["VIP"]);
		// Tagging twice records one event only
		expect(
			timeline.events.filter((e) => e.type === "contact.tag_added"),
		).toHaveLength(1);

		await records.removeTag(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			tagId: first.tagId,
		});
		const after = await records.getTimeline(a.workspaceId, "contact", id);
		expect(after.tags).toHaveLength(0);
		// Removed from its last record, the tag itself is gone
		expect(
			(await records.listWorkspaceTags(a.workspaceId)).some(
				(t) => t.id === first.tagId,
			),
		).toBe(false);
		expect(after.events.some((e) => e.type === "contact.tag_removed")).toBe(
			true,
		);
	});

	test("B can't tag A's records, see A's tags, or filter by them", async () => {
		const id = await newContact(a, actorA());
		const { tagId } = await records.addTag(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			name: "Secret",
		});
		expect(
			await status(
				records.addTag(b.workspaceId, actorB(), {
					subjectType: "contact",
					subjectId: id,
					name: "Hijack",
				}),
			),
		).toBe(404);
		expect(
			await status(
				records.removeTag(b.workspaceId, actorB(), {
					subjectType: "contact",
					subjectId: id,
					tagId,
				}),
			),
		).toBe(404);
		expect(
			await status(records.getTimeline(b.workspaceId, "contact", id)),
		).toBe(404);
		expect(
			(await records.listWorkspaceTags(b.workspaceId)).some(
				(t) => t.id === tagId,
			),
		).toBe(false);

		// Filtering B's list by A's tag finds nothing; A's filter finds the contact
		const search = {
			page: 1,
			pageSize: 100,
			q: "",
			sort: "createdAt" as const,
			dir: "desc" as const,
			show: "active" as const,
			filters: [],
			tag: tagId,
		};
		expect((await contacts.listContacts(b.workspaceId, search)).total).toBe(0);
		const listA = await contacts.listContacts(a.workspaceId, search);
		expect(listA.rows.map((r) => r.id)).toEqual([id]);
		expect(listA.rows[0].tags.map((t) => t.name)).toEqual(["Secret"]);
	});

	test("a record can have at most the allowed number of tags", async () => {
		const id = await newContact(a, actorA());
		for (let i = 0; i < LIMITS.tagsPerRecord; i++) {
			await records.addTag(a.workspaceId, actorA(), {
				subjectType: "contact",
				subjectId: id,
				name: `limit-${i}`,
			});
		}
		expect(
			await status(
				records.addTag(a.workspaceId, actorA(), {
					subjectType: "contact",
					subjectId: id,
					name: "one-too-many",
				}),
			),
		).toBe(409);
	}, 30_000); // 21 sequential requests to the database
});

describe("notes", () => {
	test("B can't read, edit or delete A's notes, or add one to A's record", async () => {
		const id = await newContact(a, actorA());
		const created = await records.createNote(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			body: "Private note",
		});
		expect(
			await status(
				records.createNote(b.workspaceId, actorB(), {
					subjectType: "contact",
					subjectId: id,
					body: "x",
				}),
			),
		).toBe(404);
		expect(
			await status(records.getNoteSubject(b.workspaceId, created.id)),
		).toBe(404);
		expect(
			await status(
				records.updateNote(b.workspaceId, actorB(), {
					id: created.id,
					body: "changed",
					pinned: false,
				}),
			),
		).toBe(404);
		expect(
			await status(
				records.deleteNote(b.workspaceId, actorB(), created.id, true),
			),
		).toBe(404);
		const [still] = await db.select().from(note).where(eq(note.id, created.id));
		expect(still.body).toBe("Private note");
	});

	test("only the author edits the text; others may pin; deletion by author or admin", async () => {
		const id = await newContact(a, actorA());
		const { id: noteId } = await records.createNote(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			body: "First version",
		});
		expect(
			await status(
				records.updateNote(a.workspaceId, otherMember, {
					id: noteId,
					body: "Rewritten",
					pinned: false,
				}),
			),
		).toBe(403);
		expect(
			await status(
				records.updateNote(a.workspaceId, otherMember, {
					id: noteId,
					body: "First version",
					pinned: true,
				}),
			),
		).toBe(200);
		expect(
			await status(
				records.deleteNote(a.workspaceId, otherMember, noteId, false),
			),
		).toBe(403);
		expect(
			await status(
				records.deleteNote(a.workspaceId, otherMember, noteId, true),
			),
		).toBe(200);
		expect(
			await db.select().from(note).where(eq(note.id, noteId)),
		).toHaveLength(0);
	});

	test("pinning with a stale copy doesn't undo the author's newer text", async () => {
		const id = await newContact(a, actorA());
		const { id: noteId } = await records.createNote(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			body: "Draft",
		});
		await records.updateNote(a.workspaceId, actorA(), {
			id: noteId,
			body: "Final text",
			pinned: false,
		});
		// Someone else pins, still holding the old body
		await records.updateNote(a.workspaceId, otherMember, {
			id: noteId,
			body: "Final text",
			pinned: true,
		});
		const [row] = await db.select().from(note).where(eq(note.id, noteId));
		expect(row.body).toBe("Final text");
		expect(row.pinned).toBe(true);
	});

	test("the timeline shows notes (pinned first) and events, but never deleted note text", async () => {
		const id = await newContact(a, actorA());
		const one = await records.createNote(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			body: "Older note",
		});
		const two = await records.createNote(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			body: "Newer note",
		});
		await records.updateNote(a.workspaceId, actorA(), {
			id: one.id,
			body: "Older note",
			pinned: true,
		});
		const doomed = await records.createNote(a.workspaceId, actorA(), {
			subjectType: "contact",
			subjectId: id,
			body: "Sensitive text to erase",
		});
		await records.deleteNote(a.workspaceId, actorA(), doomed.id, false);

		const timeline = await records.getTimeline(a.workspaceId, "contact", id);
		expect(timeline.notes.map((n) => n.id)).toEqual([one.id, two.id]);
		expect(timeline.events.map((e) => e.type)).toContain(
			"contact.note_deleted",
		);
		// Note additions are shown as the notes themselves, not as events
		expect(timeline.events.some((e) => e.type === "contact.note_added")).toBe(
			false,
		);
		// The deleted text exists nowhere: not in notes, not in any event payload
		const allEvents = await db
			.select({ payload: event.payload })
			.from(event)
			.where(and(eq(event.subjectType, "contact"), eq(event.subjectId, id)));
		expect(JSON.stringify(allEvents)).not.toContain("Sensitive text");
	});

	test("archived records are read-only for tags and notes", async () => {
		const id = await newContact(a, actorA());
		await contacts.setContactArchived(a.workspaceId, actorA(), id, true);
		expect(
			await status(
				records.createNote(a.workspaceId, actorA(), {
					subjectType: "contact",
					subjectId: id,
					body: "Too late",
				}),
			),
		).toBe(409);
		expect(
			await status(
				records.addTag(a.workspaceId, actorA(), {
					subjectType: "contact",
					subjectId: id,
					name: "Late",
				}),
			),
		).toBe(409);
		// Still readable
		expect(
			await status(records.getTimeline(a.workspaceId, "contact", id)),
		).toBe(200);
	});
});
