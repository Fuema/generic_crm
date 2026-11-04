import {
	and,
	asc,
	desc,
	eq,
	gte,
	ilike,
	isNotNull,
	isNull,
	lt,
	lte,
	max,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "#/db/index";
import {
	activity,
	company,
	contact,
	deal,
	invoice,
	member,
	project,
	quote,
	salesOrder,
	task,
	user,
} from "#/db/schema";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";
import { m } from "#/paraglide/messages.js";
import {
	type Actor,
	changedFields,
	eventInsert,
} from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import type {
	ActivityInput,
	RecordWorkRef,
	TaskInput,
	TaskStatus,
	WorkSubjectType,
} from "./schema";

// Server-only data layer for tasks, activities and the calendar. Every
// function takes the workspace id first and filters by it; the server
// functions in tasks.ts pass context.workspaceId from the session, never a
// value from input. A change and its event are written in one db.batch
// (spec §11.1).

const GAP = 1024;
// Below this gap between neighbours, renumber the column to restore room
const MIN_GAP = 1e-6;

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function memberActorId(actor: Actor) {
	return actor.type === "member" ? actor.id : null;
}

async function runBatch(statements: unknown[]) {
	await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
}

// What the related record and the project are called, for lists and cards.
// Each lookup also matches the row's own workspace.
function linkNames(table: "task" | "activity") {
	const t = sql.raw(`"${table}"`);
	return {
		subjectName: sql<
			string | null
		>`(case ${t}."subject_type" when 'contact' then (select concat_ws(' ', c."first_name", c."last_name") from "contact" c where c."id" = ${t}."subject_id" and c."workspace_id" = ${t}."workspace_id") when 'company' then (select co."name" from "company" co where co."id" = ${t}."subject_id" and co."workspace_id" = ${t}."workspace_id") when 'deal' then (select d."name" from "deal" d where d."id" = ${t}."subject_id" and d."workspace_id" = ${t}."workspace_id") end)`,
		subjectNumber: sql<
			number | null
		>`(case ${t}."subject_type" when 'quote' then (select q."number" from "quote" q where q."id" = ${t}."subject_id" and q."workspace_id" = ${t}."workspace_id") when 'order' then (select o."number" from "sales_order" o where o."id" = ${t}."subject_id" and o."workspace_id" = ${t}."workspace_id") when 'invoice' then (select i."number" from "invoice" i where i."id" = ${t}."subject_id" and i."workspace_id" = ${t}."workspace_id") end)`,
		subjectYear: sql<
			number | null
		>`(case when ${t}."subject_type" = 'invoice' then (select i."year" from "invoice" i where i."id" = ${t}."subject_id" and i."workspace_id" = ${t}."workspace_id") end)`,
		projectName: sql<
			string | null
		>`(select p."name" from "project" p where p."id" = ${t}."project_id" and p."workspace_id" = ${t}."workspace_id")`,
	};
}

const taskColumns = {
	id: task.id,
	title: task.title,
	description: task.description,
	status: task.status,
	position: task.position,
	priority: task.priority,
	dueAt: task.dueAt,
	allDay: task.allDay,
	isMilestone: task.isMilestone,
	assigneeId: task.assigneeId,
	assigneeName: user.name,
	subjectType: task.subjectType,
	subjectId: task.subjectId,
	projectId: task.projectId,
	completedAt: task.completedAt,
	updatedAt: task.updatedAt,
	...linkNames("task"),
};

function selectTasks() {
	return db
		.select(taskColumns)
		.from(task)
		.leftJoin(user, eq(user.id, task.assigneeId));
}

const owner = alias(user, "owner");

const activityColumns = {
	id: activity.id,
	type: activity.type,
	subject: activity.subject,
	notes: activity.notes,
	startsAt: activity.startsAt,
	endsAt: activity.endsAt,
	allDay: activity.allDay,
	completed: activity.completed,
	ownerId: activity.ownerId,
	ownerName: owner.name,
	subjectType: activity.subjectType,
	subjectId: activity.subjectId,
	projectId: activity.projectId,
	...linkNames("activity"),
};

function selectActivities() {
	return db
		.select(activityColumns)
		.from(activity)
		.leftJoin(owner, eq(owner.id, activity.ownerId));
}

// --- References -------------------------------------------------------------

const SUBJECT_TABLES = {
	contact,
	company,
	deal,
	quote,
	order: salesOrder,
	invoice,
} as const;

type Links = {
	subjectType: string | null;
	subjectId: string | null;
	projectId: string | null;
	personId: string | null;
};

// The related record and the project must be active records of this
// workspace, and the person a member, when set or changed (an unchanged link
// to a record archived since doesn't block an edit)
async function assertLinks(workspaceId: string, next: Links, before?: Links) {
	const checks: Promise<unknown>[] = [];
	const subjectChanged =
		next.subjectType !== (before?.subjectType ?? null) ||
		next.subjectId !== (before?.subjectId ?? null);
	if (next.subjectType && next.subjectId && subjectChanged) {
		const table = SUBJECT_TABLES[next.subjectType as WorkSubjectType];
		if (!table) throw clientError(400, m.error_work_subject_not_found());
		const subjectId = next.subjectId;
		checks.push(
			db
				.select({ id: table.id })
				.from(table)
				.where(
					and(
						eq(table.id, subjectId),
						eq(table.workspaceId, workspaceId),
						isNull(table.archivedAt),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw clientError(400, m.error_work_subject_not_found());
				}),
		);
	}
	if (next.projectId && next.projectId !== (before?.projectId ?? null)) {
		const projectId = next.projectId;
		checks.push(
			db
				.select({ id: project.id })
				.from(project)
				.where(
					and(
						eq(project.id, projectId),
						eq(project.workspaceId, workspaceId),
						isNull(project.archivedAt),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw clientError(400, m.error_choose_project());
				}),
		);
	}
	if (next.personId && next.personId !== (before?.personId ?? null)) {
		checks.push(assertWorkspaceRefs(workspaceId, { userId: next.personId }));
	}
	await Promise.all(checks);
}

function links(data: TaskInput | ActivityInput) {
	return {
		subjectType: data.subjectType || null,
		subjectId: data.subjectId || null,
		projectId: data.projectId || null,
	};
}

// --- Tasks ------------------------------------------------------------------

export async function listTasks(
	workspaceId: string,
	userId: string,
	search: {
		q: string;
		assignee?: string;
		priority?: string;
		project?: string;
		dueWithin?: number | null;
	},
) {
	const filters: SQL[] = [eq(task.workspaceId, workspaceId)];
	if (search.dueWithin) {
		const until = new Date(Date.now() + search.dueWithin * 86_400_000);
		filters.push(isNotNull(task.dueAt), lte(task.dueAt, until));
	}
	if (search.q) filters.push(ilike(task.title, likePattern(search.q)));
	if (search.assignee) {
		filters.push(
			eq(task.assigneeId, search.assignee === "me" ? userId : search.assignee),
		);
	}
	if (search.priority) filters.push(eq(task.priority, search.priority));
	if (search.project) filters.push(eq(task.projectId, search.project));
	return selectTasks()
		.where(and(...filters))
		.orderBy(asc(task.position), asc(task.id))
		.limit(500);
}
export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

async function findTask(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(task)
		.where(and(eq(task.id, id), eq(task.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_task_not_found());
	return row;
}

function taskRow(data: TaskInput) {
	return {
		title: data.title,
		description: data.description || null,
		priority: data.priority,
		assigneeId: data.assigneeId || null,
		dueAt: data.dueAt ? new Date(data.dueAt) : null,
		allDay: data.allDay,
		isMilestone: data.isMilestone,
		...links(data),
	};
}

// New cards go to the top of their column; worked out in the insert itself
function topOf(workspaceId: string, status: string) {
	return sql<number>`(select coalesce(min(t."position"), ${GAP}) - ${GAP} from "task" t where t."workspace_id" = ${workspaceId} and t."status" = ${status})`;
}

function completedAtFor(from: string, to: string, current: Date | null) {
	if (to !== "done") return null;
	return from === "done" ? current : new Date();
}

// Crossing into or out of "done" is a milestone of its own
function statusEvent(from: string, to: string) {
	if (from !== "done" && to === "done") return "task.completed";
	if (from === "done" && to !== "done") return "task.reopened";
	return null;
}

export async function createTask(
	workspaceId: string,
	actor: Actor,
	data: TaskInput,
) {
	const row = taskRow(data);
	await assertLinks(workspaceId, { ...row, personId: row.assigneeId });
	const id = uuidv7();
	await runBatch([
		db.insert(task).values({
			id,
			workspaceId,
			...row,
			status: data.status,
			position: topOf(workspaceId, data.status),
			completedAt: data.status === "done" ? new Date() : null,
			createdById: memberActorId(actor),
		}),
		eventInsert(workspaceId, actor, {
			type: "task.created",
			subjectType: "task",
			subjectId: id,
			payload: { title: data.title },
		}),
	]);
	return { id };
}

export async function updateTask(
	workspaceId: string,
	actor: Actor,
	id: string,
	data: TaskInput,
) {
	const before = await findTask(workspaceId, id);
	const row = taskRow(data);
	await assertLinks(
		workspaceId,
		{ ...row, personId: row.assigneeId },
		{ ...before, personId: before.assigneeId },
	);
	const changes = changedFields(before, { ...row, status: data.status });
	if (!Object.keys(changes).length) return { id };
	const statusChanged = before.status !== data.status;
	const type = statusEvent(before.status, data.status) ?? "task.updated";
	await runBatch([
		db
			.update(task)
			.set({
				...row,
				status: data.status,
				...(statusChanged ? { position: topOf(workspaceId, data.status) } : {}),
				completedAt: completedAtFor(
					before.status,
					data.status,
					before.completedAt,
				),
				updatedAt: new Date(),
			})
			.where(and(eq(task.id, id), eq(task.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type,
			subjectType: "task",
			subjectId: id,
			payload: { title: data.title, changes },
		}),
	]);
	return { id };
}

// Drag and drop: the server computes the position from the neighbours the card
// was dropped between, so concurrent moves can't corrupt the order
export async function moveTask(
	workspaceId: string,
	actor: Actor,
	move: {
		id: string;
		status: TaskStatus;
		beforeId: string | null;
		afterId: string | null;
	},
) {
	const moving = await findTask(workspaceId, move.id);
	const status = move.status;

	const neighbours = async () => {
		const ids = [move.beforeId, move.afterId].filter(
			(id): id is string => !!id && id !== moving.id,
		);
		if (!ids.length) return [null, null] as const;
		const rows = await db
			.select({ id: task.id, position: task.position })
			.from(task)
			.where(
				and(
					eq(task.workspaceId, workspaceId),
					eq(task.status, status),
					or(...ids.map((id) => eq(task.id, id))),
				),
			);
		const at = (id: string | null) =>
			rows.find((r) => r.id === id)?.position ?? null;
		return [at(move.beforeId), at(move.afterId)] as const;
	};

	let [above, below] = await neighbours();

	// Out of room between the two neighbours: renumber the column in one
	// statement, then read them again
	if (above !== null && below !== null && below - above < MIN_GAP) {
		await db.execute(
			sql`update "task" set "position" = r.rn * ${GAP} from (select t."id", row_number() over (order by t."position", t."id") as rn from "task" t where t."workspace_id" = ${workspaceId} and t."status" = ${status} and t."id" <> ${moving.id}) r where "task"."id" = r."id" and "task"."workspace_id" = ${workspaceId}`,
		);
		[above, below] = await neighbours();
	}

	let position: number;
	if (above !== null && below !== null) position = (above + below) / 2;
	else if (above !== null) position = above + GAP;
	else if (below !== null) position = below - GAP;
	else {
		const [{ bottom }] = await db
			.select({ bottom: max(task.position) })
			.from(task)
			.where(
				and(
					eq(task.workspaceId, workspaceId),
					eq(task.status, status),
					ne(task.id, moving.id),
				),
			);
		position = (bottom ?? 0) + GAP;
	}

	const type = statusEvent(moving.status, status);
	await runBatch([
		db
			.update(task)
			.set({
				status,
				position,
				completedAt: completedAtFor(moving.status, status, moving.completedAt),
				updatedAt: new Date(),
			})
			.where(and(eq(task.id, moving.id), eq(task.workspaceId, workspaceId))),
		...(type
			? [
					eventInsert(workspaceId, actor, {
						type,
						subjectType: "task",
						subjectId: moving.id,
						payload: { title: moving.title },
					}),
				]
			: []),
	]);
	return { id: moving.id, status, position };
}

export async function deleteTask(
	workspaceId: string,
	actor: Actor,
	id: string,
) {
	const before = await findTask(workspaceId, id);
	await runBatch([
		db
			.delete(task)
			.where(and(eq(task.id, id), eq(task.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: "task.deleted",
			subjectType: "task",
			subjectId: id,
			payload: { title: before.title },
		}),
	]);
	return { id };
}

// --- Activities -------------------------------------------------------------

async function findActivity(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(activity)
		.where(and(eq(activity.id, id), eq(activity.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_activity_not_found());
	return row;
}

function activityRow(data: ActivityInput) {
	return {
		type: data.type,
		subject: data.subject,
		notes: data.notes || null,
		startsAt: new Date(data.startsAt),
		endsAt: data.endsAt ? new Date(data.endsAt) : null,
		allDay: data.allDay,
		completed: data.completed,
		ownerId: data.ownerId || null,
		...links(data),
	};
}

export async function createActivity(
	workspaceId: string,
	actor: Actor,
	data: ActivityInput,
) {
	const row = activityRow(data);
	await assertLinks(workspaceId, { ...row, personId: row.ownerId });
	const id = uuidv7();
	await runBatch([
		db.insert(activity).values({
			id,
			workspaceId,
			...row,
			createdById: memberActorId(actor),
		}),
		eventInsert(workspaceId, actor, {
			type: "activity.created",
			subjectType: "activity",
			subjectId: id,
			payload: { subject: data.subject, activityType: data.type },
		}),
	]);
	return { id };
}

export async function updateActivity(
	workspaceId: string,
	actor: Actor,
	id: string,
	data: ActivityInput,
) {
	const before = await findActivity(workspaceId, id);
	const row = activityRow(data);
	await assertLinks(
		workspaceId,
		{ ...row, personId: row.ownerId },
		{ ...before, personId: before.ownerId },
	);
	const changes = changedFields(before, row);
	if (!Object.keys(changes).length) return { id };
	await runBatch([
		db
			.update(activity)
			.set({ ...row, updatedAt: new Date() })
			.where(and(eq(activity.id, id), eq(activity.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type:
				!before.completed && row.completed
					? "activity.completed"
					: "activity.updated",
			subjectType: "activity",
			subjectId: id,
			payload: { subject: data.subject, activityType: data.type, changes },
		}),
	]);
	return { id };
}

export async function deleteActivity(
	workspaceId: string,
	actor: Actor,
	id: string,
) {
	const before = await findActivity(workspaceId, id);
	await runBatch([
		db
			.delete(activity)
			.where(and(eq(activity.id, id), eq(activity.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: "activity.deleted",
			subjectType: "activity",
			subjectId: id,
			payload: { subject: before.subject, activityType: before.type },
		}),
	]);
	return { id };
}

// --- Calendar, record cards and pickers -------------------------------------

// Tasks with a due date and activities in [from, to)
export async function listCalendar(
	workspaceId: string,
	range: { from: string; to: string },
) {
	const from = new Date(range.from);
	const to = new Date(range.to);
	const [tasks, activities] = await Promise.all([
		selectTasks()
			.where(
				and(
					eq(task.workspaceId, workspaceId),
					isNotNull(task.dueAt),
					gte(task.dueAt, from),
					lt(task.dueAt, to),
				),
			)
			.orderBy(asc(task.dueAt))
			.limit(500),
		selectActivities()
			.where(
				and(
					eq(activity.workspaceId, workspaceId),
					gte(activity.startsAt, from),
					lt(activity.startsAt, to),
				),
			)
			.orderBy(asc(activity.startsAt))
			.limit(500),
	]);
	return { tasks, activities };
}
export type CalendarTask = Awaited<
	ReturnType<typeof listCalendar>
>["tasks"][number];
export type CalendarActivity = Awaited<
	ReturnType<typeof listCalendar>
>["activities"][number];

// A record page's tasks (open, plus those done in the last 30 days) and its
// latest activities. A project gathers the tasks and activities linked to it.
export async function recordWork(workspaceId: string, ref: RecordWorkRef) {
	const recent = new Date(Date.now() - 30 * 86_400_000);
	const taskLink =
		ref.subjectType === "project"
			? eq(task.projectId, ref.subjectId)
			: and(
					eq(task.subjectType, ref.subjectType),
					eq(task.subjectId, ref.subjectId),
				);
	const activityLink =
		ref.subjectType === "project"
			? eq(activity.projectId, ref.subjectId)
			: and(
					eq(activity.subjectType, ref.subjectType),
					eq(activity.subjectId, ref.subjectId),
				);
	const [tasks, activities] = await Promise.all([
		selectTasks()
			.where(
				and(
					eq(task.workspaceId, workspaceId),
					taskLink,
					or(ne(task.status, "done"), gte(task.completedAt, recent)),
				),
			)
			.orderBy(
				sql`(${task.status} = 'done')`,
				sql`${task.dueAt} asc nulls last`,
				asc(task.position),
			)
			.limit(50),
		selectActivities()
			.where(and(eq(activity.workspaceId, workspaceId), activityLink))
			.orderBy(desc(activity.startsAt))
			.limit(30),
	]);
	return { tasks, activities };
}

// People and active projects for the forms
export async function workOptions(workspaceId: string) {
	const [members, projects] = await Promise.all([
		db
			.select({ id: user.id, name: user.name })
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(eq(member.organizationId, workspaceId))
			.orderBy(asc(user.name)),
		db
			.select({ id: project.id, name: project.name })
			.from(project)
			.where(
				and(eq(project.workspaceId, workspaceId), isNull(project.archivedAt)),
			)
			.orderBy(asc(project.name))
			.limit(500),
	]);
	return { members, projects };
}

export type SubjectChoice = {
	id: string;
	name: string | null;
	number: number | null;
	year: number | null;
	detail: string | null;
};

const contactOf = (table: "quote" | "sales_order" | "invoice") =>
	sql<
		string | null
	>`(select concat_ws(' ', c."first_name", c."last_name") from "contact" c where c."id" = ${sql.raw(`"${table}"`)}."contact_id" and c."workspace_id" = ${sql.raw(`"${table}"`)}."workspace_id")`;

// The form's record picker: up to 10 active records of one type
export async function searchSubjects(
	workspaceId: string,
	type: WorkSubjectType,
	q: string,
): Promise<SubjectChoice[]> {
	const pattern = q ? likePattern(q) : null;
	// "QUO-0012", "12" or "2026-0012" find number 12
	const digits = q.match(/\d+$/)?.[0];
	const number = digits && digits.length <= 9 ? Number(digits) : null;
	switch (type) {
		case "contact":
			return db
				.select({
					id: contact.id,
					name: sql<string>`concat_ws(' ', ${contact.firstName}, ${contact.lastName})`,
					number: sql<null>`null`,
					year: sql<null>`null`,
					detail: contact.email,
				})
				.from(contact)
				.where(
					and(
						eq(contact.workspaceId, workspaceId),
						isNull(contact.archivedAt),
						pattern
							? or(
									sql`concat_ws(' ', ${contact.firstName}, ${contact.lastName}) ilike ${pattern}`,
									ilike(contact.email, pattern),
								)
							: undefined,
					),
				)
				.orderBy(asc(contact.firstName), asc(contact.lastName))
				.limit(10);
		case "company":
			return db
				.select({
					id: company.id,
					name: company.name,
					number: sql<null>`null`,
					year: sql<null>`null`,
					detail: company.domain,
				})
				.from(company)
				.where(
					and(
						eq(company.workspaceId, workspaceId),
						isNull(company.archivedAt),
						pattern ? ilike(company.name, pattern) : undefined,
					),
				)
				.orderBy(asc(company.name))
				.limit(10);
		case "deal":
			return db
				.select({
					id: deal.id,
					name: deal.name,
					number: sql<null>`null`,
					year: sql<null>`null`,
					detail: sql<
						string | null
					>`(select concat_ws(' ', c."first_name", c."last_name") from "contact" c where c."id" = ${deal.contactId} and c."workspace_id" = ${deal.workspaceId})`,
				})
				.from(deal)
				.where(
					and(
						eq(deal.workspaceId, workspaceId),
						isNull(deal.archivedAt),
						pattern ? ilike(deal.name, pattern) : undefined,
					),
				)
				.orderBy(desc(deal.createdAt))
				.limit(10);
		case "quote": {
			const detail = contactOf("quote");
			return db
				.select({
					id: quote.id,
					name: sql<null>`null`,
					number: quote.number,
					year: sql<null>`null`,
					detail,
				})
				.from(quote)
				.where(
					and(
						eq(quote.workspaceId, workspaceId),
						isNull(quote.archivedAt),
						pattern
							? or(
									number !== null ? eq(quote.number, number) : undefined,
									sql`coalesce(${detail}, '') ilike ${pattern}`,
								)
							: undefined,
					),
				)
				.orderBy(desc(quote.number))
				.limit(10);
		}
		case "order": {
			const detail = contactOf("sales_order");
			return db
				.select({
					id: salesOrder.id,
					name: sql<null>`null`,
					number: salesOrder.number,
					year: sql<null>`null`,
					detail,
				})
				.from(salesOrder)
				.where(
					and(
						eq(salesOrder.workspaceId, workspaceId),
						isNull(salesOrder.archivedAt),
						pattern
							? or(
									number !== null ? eq(salesOrder.number, number) : undefined,
									sql`coalesce(${detail}, '') ilike ${pattern}`,
								)
							: undefined,
					),
				)
				.orderBy(desc(salesOrder.number))
				.limit(10);
		}
		case "invoice": {
			const detail = contactOf("invoice");
			return db
				.select({
					id: invoice.id,
					name: sql<null>`null`,
					number: invoice.number,
					year: invoice.year,
					detail,
				})
				.from(invoice)
				.where(
					and(
						eq(invoice.workspaceId, workspaceId),
						isNull(invoice.archivedAt),
						pattern
							? or(
									number !== null ? eq(invoice.number, number) : undefined,
									sql`coalesce(${detail}, '') ilike ${pattern}`,
								)
							: undefined,
					),
				)
				.orderBy(desc(invoice.createdAt))
				.limit(10);
		}
	}
}
