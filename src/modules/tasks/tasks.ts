import { createServerFn } from "@tanstack/react-start";
import { requirePermission } from "#/lib/authz";
import {
	activityInputSchema,
	calendarRangeSchema,
	listTasksSchema,
	moveTaskSchema,
	recordWorkSchema,
	subjectSearchSchema,
	taskInputSchema,
	updateActivitySchema,
	updateTaskSchema,
	workIdSchema,
} from "./schema";
import * as data from "./tasks.server";

// Server functions for tasks, activities and the calendar. Each checks the
// caller's role and validates its input, then calls the data layer with the
// workspace from the session (context.workspaceId), never from input.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listTasks = createServerFn({ method: "GET" })
	.middleware([requirePermission({ task: ["read"] })])
	.validator(listTasksSchema)
	.handler(({ data: search, context }) =>
		data.listTasks(context.workspaceId, context.session.user.id, search),
	);

export const createTask = createServerFn({ method: "POST" })
	.middleware([requirePermission({ task: ["create"] })])
	.validator(taskInputSchema)
	.handler(({ data: input, context }) =>
		data.createTask(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateTask = createServerFn({ method: "POST" })
	.middleware([requirePermission({ task: ["update"] })])
	.validator(updateTaskSchema)
	.handler(({ data: { id, ...input }, context }) =>
		data.updateTask(
			context.workspaceId,
			member(context.session.user.id),
			id,
			input,
		),
	);

export const moveTask = createServerFn({ method: "POST" })
	.middleware([requirePermission({ task: ["update"] })])
	.validator(moveTaskSchema)
	.handler(({ data: move, context }) =>
		data.moveTask(context.workspaceId, member(context.session.user.id), move),
	);

export const deleteTask = createServerFn({ method: "POST" })
	.middleware([requirePermission({ task: ["delete"] })])
	.validator(workIdSchema)
	.handler(({ data: { id }, context }) =>
		data.deleteTask(context.workspaceId, member(context.session.user.id), id),
	);

export const createActivity = createServerFn({ method: "POST" })
	.middleware([requirePermission({ activity: ["create"] })])
	.validator(activityInputSchema)
	.handler(({ data: input, context }) =>
		data.createActivity(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateActivity = createServerFn({ method: "POST" })
	.middleware([requirePermission({ activity: ["update"] })])
	.validator(updateActivitySchema)
	.handler(({ data: { id, ...input }, context }) =>
		data.updateActivity(
			context.workspaceId,
			member(context.session.user.id),
			id,
			input,
		),
	);

export const deleteActivity = createServerFn({ method: "POST" })
	.middleware([requirePermission({ activity: ["delete"] })])
	.validator(workIdSchema)
	.handler(({ data: { id }, context }) =>
		data.deleteActivity(
			context.workspaceId,
			member(context.session.user.id),
			id,
		),
	);

export const listCalendar = createServerFn({ method: "GET" })
	.middleware([requirePermission({ task: ["read"], activity: ["read"] })])
	.validator(calendarRangeSchema)
	.handler(({ data: range, context }) =>
		data.listCalendar(context.workspaceId, range),
	);

export const listRecordWork = createServerFn({ method: "GET" })
	.middleware([requirePermission({ task: ["read"], activity: ["read"] })])
	.validator(recordWorkSchema)
	.handler(({ data: ref, context }) =>
		data.recordWork(context.workspaceId, ref),
	);

// People and projects for the task and activity forms
export const getWorkOptions = createServerFn({ method: "GET" })
	.middleware([requirePermission({ task: ["read"] })])
	.handler(async ({ context }) => ({
		...(await data.workOptions(context.workspaceId)),
		currentUserId: context.session.user.id,
	}));

// The forms' record picker. Every role that reads tasks also reads contacts,
// companies, deals and documents (spec §12.2); only names and numbers return
export const searchWorkSubjects = createServerFn({ method: "GET" })
	.middleware([requirePermission({ task: ["read"] })])
	.validator(subjectSearchSchema)
	.handler(({ data: { type, q }, context }) =>
		data.searchSubjects(context.workspaceId, type, q),
	);

export type TaskCard = Awaited<ReturnType<typeof listTasks>>[number];
export type WorkOptions = Awaited<ReturnType<typeof getWorkOptions>>;
export type CalendarData = Awaited<ReturnType<typeof listCalendar>>;
export type CalendarTask = CalendarData["tasks"][number];
export type CalendarActivity = CalendarData["activities"][number];
export type RecordWork = Awaited<ReturnType<typeof listRecordWork>>;
export type SubjectChoice = Awaited<
	ReturnType<typeof searchWorkSubjects>
>[number];
