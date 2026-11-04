import { expect, test } from "bun:test";
import {
	activityInputSchema,
	calendarRangeSchema,
	taskBoardSearchSchema,
	taskInputSchema,
} from "#/modules/tasks/schema";

const contactId = "0195f0e2-7c1a-7000-8000-000000000001";
const projectId = "0195f0e2-7c1a-7000-8000-000000000002";

const task = {
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
};

const activity = {
	type: "call",
	subject: "Intro call",
	notes: "",
	startsAt: "2026-11-04T09:00:00.000Z",
	endsAt: null,
	allDay: false,
	completed: false,
	ownerId: "",
	subjectType: "contact",
	subjectId: contactId,
	projectId: "",
};

test("a task needs a title; links are optional", () => {
	expect(taskInputSchema.safeParse(task).success).toBe(true);
	expect(taskInputSchema.safeParse({ ...task, title: " " }).success).toBe(
		false,
	);
});

test("the related record comes as a type and an id together", () => {
	const ok = { ...task, subjectType: "contact", subjectId: contactId };
	expect(taskInputSchema.safeParse(ok).success).toBe(true);
	expect(
		taskInputSchema.safeParse({ ...task, subjectType: "contact" }).success,
	).toBe(false);
	expect(
		taskInputSchema.safeParse({ ...task, subjectId: contactId }).success,
	).toBe(false);
	// Old customers and projects aren't record types of their own here
	for (const subjectType of ["customer", "project"]) {
		expect(
			taskInputSchema.safeParse({ ...task, subjectType, subjectId: contactId })
				.success,
		).toBe(false);
	}
});

test("a milestone needs a project", () => {
	expect(
		taskInputSchema.safeParse({ ...task, isMilestone: true }).success,
	).toBe(false);
	expect(
		taskInputSchema.safeParse({ ...task, isMilestone: true, projectId })
			.success,
	).toBe(true);
});

test("an activity can't end before it starts", () => {
	expect(activityInputSchema.safeParse(activity).success).toBe(true);
	expect(
		activityInputSchema.safeParse({
			...activity,
			endsAt: "2026-11-04T08:00:00.000Z",
		}).success,
	).toBe(false);
	expect(
		activityInputSchema.safeParse({ ...activity, subject: "" }).success,
	).toBe(false);
});

test("calendar ranges are short; board search falls back to defaults", () => {
	expect(
		calendarRangeSchema.safeParse({
			from: "2026-11-01T00:00:00.000Z",
			to: "2027-02-01T00:00:00.000Z",
		}).success,
	).toBe(false);
	const parsed = taskBoardSearchSchema.parse({
		priority: "huge",
		project: "x",
	});
	expect([parsed.q, parsed.priority, parsed.project]).toEqual([
		"",
		undefined,
		undefined,
	]);
});
