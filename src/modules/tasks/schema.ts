import { z } from "zod";
import { m } from "#/paraglide/messages.js";

// Tasks, activities and the calendar (spec §10), phase 3 step 2. Shared by the
// pages and the server; the server re-checks every reference.

export const TASK_STATUSES = [
	"backlog",
	"todo",
	"in_progress",
	"review",
	"done",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const ACTIVITY_TYPES = [
	"call",
	"meeting",
	"email",
	"follow_up",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// The one record a task or activity is about (owner decision 2026-11-03);
// a project is a separate, optional link
export const WORK_SUBJECT_TYPES = [
	"contact",
	"company",
	"deal",
	"quote",
	"order",
	"invoice",
] as const;
export type WorkSubjectType = (typeof WORK_SUBJECT_TYPES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, typeof m.task_status_todo> =
	{
		backlog: m.task_status_backlog,
		todo: m.task_status_todo,
		in_progress: m.task_status_in_progress,
		review: m.task_status_review,
		done: m.task_status_done,
	};

export const TASK_PRIORITY_LABELS: Record<
	TaskPriority,
	typeof m.task_priority_low
> = {
	low: m.task_priority_low,
	medium: m.task_priority_medium,
	high: m.task_priority_high,
	urgent: m.task_priority_urgent,
};

export const ACTIVITY_TYPE_LABELS: Record<
	ActivityType,
	typeof m.activity_type_call
> = {
	call: m.activity_type_call,
	meeting: m.activity_type_meeting,
	email: m.activity_type_email,
	follow_up: m.activity_type_follow_up,
};

export const SUBJECT_TYPE_LABELS: Record<
	WorkSubjectType,
	typeof m.work_subject_contact
> = {
	contact: m.work_subject_contact,
	company: m.work_subject_company,
	deal: m.work_subject_deal,
	quote: m.work_subject_quote,
	order: m.work_subject_order,
	invoice: m.work_subject_invoice,
};

const id = z.uuid({ error: () => m.validation_invalid_id() });
const optionalId = z.union([z.literal(""), id]);
const memberId = z.string().max(64, { error: () => m.validation_invalid_id() });
// Dates travel as ISO strings; null means none
const instant = z.iso.datetime({
	offset: true,
	error: () => m.validation_date(),
});

// Subject type and id come together, or neither
const subjectFields = {
	subjectType: z.union([z.literal(""), z.enum(WORK_SUBJECT_TYPES)]),
	subjectId: optionalId,
	projectId: optionalId,
};
const subjectPaired = (v: { subjectType: string; subjectId: string }) =>
	(v.subjectType === "") === (v.subjectId === "");

export const taskInputSchema = z
	.object({
		title: z
			.string()
			.trim()
			.min(1, { error: () => m.validation_task_title_required() })
			.max(200, { error: () => m.validation_text_max({ max: 200 }) }),
		description: z
			.string()
			.trim()
			.max(5000, { error: () => m.validation_text_max({ max: 5000 }) }),
		status: z.enum(TASK_STATUSES),
		priority: z.enum(TASK_PRIORITIES),
		assigneeId: memberId,
		dueAt: instant.nullable(),
		allDay: z.boolean(),
		isMilestone: z.boolean(),
		...subjectFields,
	})
	.refine(subjectPaired, {
		error: () => m.validation_work_subject(),
		path: ["subjectId"],
	})
	// A milestone marks a point in a project
	.refine((v) => !v.isMilestone || v.projectId !== "", {
		error: () => m.validation_milestone_project(),
		path: ["projectId"],
	});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const updateTaskSchema = z.object({ id }).and(taskInputSchema);

// Drop a card into a column, between two neighbours (either may be missing)
export const moveTaskSchema = z.object({
	id,
	status: z.enum(TASK_STATUSES),
	beforeId: id.nullable(),
	afterId: id.nullable(),
});

export const activityInputSchema = z
	.object({
		type: z.enum(ACTIVITY_TYPES),
		subject: z
			.string()
			.trim()
			.min(1, { error: () => m.validation_activity_subject_required() })
			.max(200, { error: () => m.validation_text_max({ max: 200 }) }),
		notes: z
			.string()
			.trim()
			.max(5000, { error: () => m.validation_text_max({ max: 5000 }) }),
		startsAt: instant,
		endsAt: instant.nullable(),
		allDay: z.boolean(),
		completed: z.boolean(),
		ownerId: memberId,
		...subjectFields,
	})
	.refine(subjectPaired, {
		error: () => m.validation_work_subject(),
		path: ["subjectId"],
	})
	.refine((a) => !a.endsAt || new Date(a.endsAt) >= new Date(a.startsAt), {
		error: () => m.validation_activity_end(),
		path: ["endsAt"],
	});
export type ActivityInput = z.infer<typeof activityInputSchema>;

export const updateActivitySchema = z.object({ id }).and(activityInputSchema);

export const workIdSchema = z.object({ id });

export const taskBoardSearchSchema = z.object({
	q: z.string().trim().max(100).catch("").default(""),
	// "me" or a member's user id
	assignee: z.string().max(64).optional().catch(undefined),
	priority: z.enum(TASK_PRIORITIES).optional().catch(undefined),
	project: id.optional().catch(undefined),
});
export type TaskBoardSearch = z.infer<typeof taskBoardSearchSchema>;

export const listTasksSchema = taskBoardSearchSchema.extend({
	// Only tasks due within this many days, overdue ones included
	dueWithin: z.number().int().min(1).max(365).nullish(),
});

// "days" shows the person's chosen number of days from the anchor date
export const CALENDAR_VIEWS = ["day", "days", "week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export const calendarSearchSchema = z.object({
	view: z.enum(CALENDAR_VIEWS).catch("week").default("week"),
	// YYYY-MM-DD; empty means today (resolved in the browser's time zone)
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.catch(undefined),
	show: z.enum(["all", "tasks", "activities"]).catch("all").default("all"),
});
export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

// The server only accepts ranges up to ~7 weeks (a month view plus padding)
export const calendarRangeSchema = z
	.object({ from: instant, to: instant })
	.refine((r) => {
		const span = new Date(r.to).getTime() - new Date(r.from).getTime();
		return span > 0 && span <= 50 * 24 * 60 * 60 * 1000;
	});

// The tasks and activities of one record, for its page
export const recordWorkSchema = z.object({
	subjectType: z.enum([...WORK_SUBJECT_TYPES, "project"]),
	subjectId: id,
});
export type RecordWorkRef = z.infer<typeof recordWorkSchema>;

// The form's record picker
export const subjectSearchSchema = z.object({
	type: z.enum(WORK_SUBJECT_TYPES),
	q: z.string().trim().max(100),
});
