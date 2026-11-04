import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event, task } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as projects from "#/modules/projects/projects.server";
import * as records from "#/modules/records/records.server";
import type { ActivityInput, TaskInput } from "#/modules/tasks/schema";
import * as work from "#/modules/tasks/tasks.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Tasks and activities (phase 3 step 2): links checked against the workspace,
// status events, the board order, the record card, the timeline, merge and
// isolation.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });

const person = (firstName: string): ContactInput => ({
	firstName,
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "en",
	emailConsent: "unknown",
});

const taskInput = (patch: Partial<TaskInput> = {}): TaskInput => ({
	title: "Call back",
	description: "",
	status: "todo",
	priority: "medium",
	assigneeId: "",
	dueAt: null,
	allDay: true,
	isMilestone: false,
	subjectType: "",
	subjectId: "",
	projectId: "",
	...patch,
});

const activityInput = (patch: Partial<ActivityInput> = {}): ActivityInput => ({
	type: "call",
	subject: "Intro call",
	notes: "",
	startsAt: new Date().toISOString(),
	endsAt: null,
	allDay: false,
	completed: false,
	ownerId: "",
	subjectType: "",
	subjectId: "",
	projectId: "",
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

async function eventTypes(subjectType: string, subjectId: string) {
	return (
		await db
			.select({ type: event.type })
			.from(event)
			.where(
				and(eq(event.subjectType, subjectType), eq(event.subjectId, subjectId)),
			)
	)
		.map((e) => e.type)
		.sort();
}

let contactA: string;
beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("tka"), createWorkspace("tkb")]);
	contactA = (
		await contacts.createContact(a.workspaceId, actorA(), person("Ana"))
	).id;
});
afterAll(cleanup);

describe("tasks and activities", () => {
	test("a task about a contact: done and reopened write events; the card and timeline show it", async () => {
		const about = { subjectType: "contact" as const, subjectId: contactA };
		const { id } = await work.createTask(
			a.workspaceId,
			actorA(),
			taskInput({ ...about, assigneeId: a.userId }),
		);
		await work.updateTask(
			a.workspaceId,
			actorA(),
			id,
			taskInput({ ...about, assigneeId: a.userId, status: "done" }),
		);
		await work.moveTask(a.workspaceId, actorA(), {
			id,
			status: "todo",
			beforeId: null,
			afterId: null,
		});
		expect(await eventTypes("task", id)).toEqual([
			"task.completed",
			"task.created",
			"task.reopened",
		]);
		const card = await work.recordWork(a.workspaceId, about);
		expect(card.tasks.map((t) => [t.id, t.subjectName])).toEqual([[id, "Ana"]]);
		// The contact's timeline shows the task's creation and completion only
		const timeline = await records.getTimeline(
			a.workspaceId,
			"contact",
			contactA,
		);
		const types = timeline.events.map((e) => e.type);
		expect(types).toContain("task.created");
		expect(types).toContain("task.completed");
		expect(types).not.toContain("task.reopened");
	});

	test("cards dropped between neighbours keep their order", async () => {
		const ids: string[] = [];
		for (const title of ["One", "Two", "Three"]) {
			ids.push(
				(
					await work.createTask(
						a.workspaceId,
						actorA(),
						taskInput({ title, status: "review" }),
					)
				).id,
			);
		}
		// New cards go on top: Three, Two, One. Drop One between Three and Two.
		await work.moveTask(a.workspaceId, actorA(), {
			id: ids[0],
			status: "review",
			beforeId: ids[2],
			afterId: ids[1],
		});
		const column = await db
			.select({ title: task.title })
			.from(task)
			.where(
				and(eq(task.workspaceId, a.workspaceId), eq(task.status, "review")),
			)
			.orderBy(task.position);
		expect(column.map((t) => t.title)).toEqual(["Three", "One", "Two"]);
	});

	test("an activity on a project shows on the project; a milestone task too", async () => {
		const p = await projects.createProject(a.workspaceId, actorA(), {
			name: "Website",
			description: "",
			status: "active",
			startDate: "",
			dueDate: "",
			ownerId: "",
			contactId: "",
			companyId: "",
		});
		const act = await work.createActivity(
			a.workspaceId,
			actorA(),
			activityInput({ projectId: p.id }),
		);
		await work.updateActivity(
			a.workspaceId,
			actorA(),
			act.id,
			activityInput({ projectId: p.id, completed: true }),
		);
		const milestone = await work.createTask(
			a.workspaceId,
			actorA(),
			taskInput({ title: "Launch", projectId: p.id, isMilestone: true }),
		);
		await work.createTask(
			a.workspaceId,
			actorA(),
			taskInput({ title: "Routine", projectId: p.id }),
		);
		const card = await work.recordWork(a.workspaceId, {
			subjectType: "project",
			subjectId: p.id,
		});
		expect(card.activities.map((x) => x.id)).toEqual([act.id]);
		expect(card.tasks).toHaveLength(2);
		const timeline = await records.getTimeline(a.workspaceId, "project", p.id);
		const shown = timeline.events
			.filter((e) => e.subjectType !== "project")
			.map((e) => `${e.type}:${e.relatedName}`)
			.sort();
		expect(shown).toEqual([
			"activity.completed:Intro call",
			"activity.created:Intro call",
			"task.created:Launch",
		]);
		expect(milestone.id).toBeTruthy();
	});

	test("merging contacts moves their tasks and activities", async () => {
		const keep = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Keep"),
		);
		const dup = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Dup"),
		);
		const about = { subjectType: "contact" as const, subjectId: dup.id };
		await work.createTask(a.workspaceId, actorA(), taskInput(about));
		await work.createActivity(a.workspaceId, actorA(), activityInput(about));
		await contacts.mergeContacts(a.workspaceId, actorA(), {
			keepId: keep.id,
			duplicateId: dup.id,
			choices: {},
		});
		const card = await work.recordWork(a.workspaceId, {
			subjectType: "contact",
			subjectId: keep.id,
		});
		expect([card.tasks.length, card.activities.length]).toEqual([1, 1]);
	});

	test("links must be active records of the same workspace", async () => {
		const archived = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Gone"),
		);
		await contacts.setContactArchived(
			a.workspaceId,
			actorA(),
			archived.id,
			true,
		);
		for (const patch of [
			{ subjectType: "contact" as const, subjectId: archived.id },
			{ subjectType: "deal" as const, subjectId: crypto.randomUUID() },
			{ projectId: crypto.randomUUID() },
			{ assigneeId: b.userId },
		]) {
			expect(
				await status(
					work.createTask(a.workspaceId, actorA(), taskInput(patch)),
				),
			).toBe(400);
		}
	});

	test("never reaches across workspaces", async () => {
		const t = await work.createTask(
			a.workspaceId,
			actorA(),
			taskInput({ title: "Private" }),
		);
		const act = await work.createActivity(
			a.workspaceId,
			actorA(),
			activityInput({ subject: "Private" }),
		);
		// B can't link A's contact, nor change, move or delete A's work
		expect(
			await status(
				work.createTask(
					b.workspaceId,
					actorB(),
					taskInput({ subjectType: "contact", subjectId: contactA }),
				),
			),
		).toBe(400);
		expect(
			await status(work.updateTask(b.workspaceId, actorB(), t.id, taskInput())),
		).toBe(404);
		expect(
			await status(
				work.moveTask(b.workspaceId, actorB(), {
					id: t.id,
					status: "done",
					beforeId: null,
					afterId: null,
				}),
			),
		).toBe(404);
		expect(await status(work.deleteTask(b.workspaceId, actorB(), t.id))).toBe(
			404,
		);
		expect(
			await status(work.deleteActivity(b.workspaceId, actorB(), act.id)),
		).toBe(404);
		// Lists, the calendar, the card and the picker stay in B
		const listB = await work.listTasks(b.workspaceId, b.userId, {
			q: "Private",
		});
		expect(listB).toHaveLength(0);
		const now = Date.now();
		const calendar = await work.listCalendar(b.workspaceId, {
			from: new Date(now - 86_400_000).toISOString(),
			to: new Date(now + 86_400_000).toISOString(),
		});
		expect(calendar.activities).toHaveLength(0);
		const card = await work.recordWork(b.workspaceId, {
			subjectType: "contact",
			subjectId: contactA,
		});
		expect([card.tasks.length, card.activities.length]).toEqual([0, 0]);
		expect(await work.searchSubjects(b.workspaceId, "contact", "Ana")).toEqual(
			[],
		);
	});
});
