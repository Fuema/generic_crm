// Seeds demo tasks and activities into one workspace, so the board and the
// calendar have something to show. Rows are tagged "[demo]" in their
// description/notes so --clear removes exactly those.
//
//   bun run db:seed:planning --email you@example.com --workspace "Name"
//   bun run db:seed:planning --email you@example.com --workspace "Name" --clear
import { faker } from "@faker-js/faker";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { db } from "../src/db/index";
import { activity, contact, member, organization, task, user } from "../src/db/schema";
import { ACTIVITY_TYPES, TASK_PRIORITIES, TASK_STATUSES } from "../src/modules/tasks/schema";

const TAG = "[demo]";
const DAY = 24 * 60 * 60 * 1000;

function arg(name: string) {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? undefined : (process.argv[i + 1] ?? "");
}

const email = arg("email")?.trim().toLowerCase();
const workspaceName = arg("workspace")?.trim();
if (!email || !workspaceName) {
	console.error('Usage: bun run db:seed:planning --email you@example.com --workspace "Name" [--clear]');
	process.exit(1);
}

const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
if (!owner) {
	console.error(`No user with email ${email}`);
	process.exit(1);
}
const [workspace] = await db
	.select({ id: organization.id, name: organization.name })
	.from(member)
	.innerJoin(organization, eq(organization.id, member.organizationId))
	.where(and(eq(member.userId, owner.id), eq(organization.name, workspaceName)))
	.limit(1);
if (!workspace) {
	console.error(`${email} isn't a member of a workspace named "${workspaceName}"`);
	process.exit(1);
}
const workspaceId = workspace.id;

if (process.argv.includes("--clear")) {
	const tasks = await db
		.delete(task)
		.where(and(eq(task.workspaceId, workspaceId), like(task.description, `${TAG}%`)))
		.returning({ id: task.id });
	const activities = await db
		.delete(activity)
		.where(and(eq(activity.workspaceId, workspaceId), like(activity.notes, `${TAG}%`)))
		.returning({ id: activity.id });
	console.log(`Removed ${tasks.length} tasks and ${activities.length} activities from "${workspace.name}".`);
	process.exit(0);
}

const [existing] = await db
	.select({ id: task.id })
	.from(task)
	.where(and(eq(task.workspaceId, workspaceId), like(task.description, `${TAG}%`)))
	.limit(1);
if (existing) {
	console.error(`"${workspace.name}" already has demo planning data. Run with --clear first.`);
	process.exit(1);
}

faker.seed([...workspaceId].reduce((sum, c) => sum + c.charCodeAt(0), 11));
const [members, customers] = await Promise.all([
	db.select({ id: member.userId }).from(member).where(eq(member.organizationId, workspaceId)),
	// Tasks and activities link to active contacts (phase 3)
	db
		.select({ id: contact.id, name: sql<string>`concat_ws(' ', ${contact.firstName}, ${contact.lastName})` })
		.from(contact)
		.where(and(eq(contact.workspaceId, workspaceId), isNull(contact.archivedAt)))
		.limit(100),
]);
const pick = <T>(list: T[], probability: number) =>
	list.length ? (faker.helpers.maybe(() => faker.helpers.arrayElement(list), { probability }) ?? null) : null;

// Today at a given UTC hour, shifted by whole days
const at = (days: number, hourUTC: number) => {
	const d = new Date(Date.now() + days * DAY);
	d.setUTCHours(hourUTC, 0, 0, 0);
	return d;
};
// All-day dates are stored at 12:00 UTC (see src/modules/tasks/calendar.ts)
const allDayAt = (days: number) => at(days, 12);

const TITLES = [
	"Prepare quote for",
	"Follow up on proposal with",
	"Send contract to",
	"Review order details with",
	"Schedule onboarding for",
	"Check payment status for",
	"Update account notes for",
	"Plan renewal call with",
];

// Columns weighted toward active work; done and backlog smaller
const plan = [
	...Array(3).fill("backlog"),
	...Array(6).fill("todo"),
	...Array(5).fill("in_progress"),
	...Array(3).fill("review"),
	...Array(4).fill("done"),
] as (typeof TASK_STATUSES)[number][];

const columnPosition = new Map<string, number>();
const taskRows = plan.map((status) => {
	const c = pick(customers, 0.75);
	const allDay = faker.datatype.boolean({ probability: 0.6 });
	// Mostly upcoming, a few overdue; backlog items often have no date
	const offset = faker.number.int({ min: -6, max: 21 });
	const hasDue = status !== "backlog" || faker.datatype.boolean({ probability: 0.3 });
	const dueAt = hasDue ? (allDay ? allDayAt(offset) : at(offset, faker.number.int({ min: 13, max: 21 }))) : null;
	const position = (columnPosition.get(status) ?? 0) + 1024;
	columnPosition.set(status, position);
	return {
		id: crypto.randomUUID(),
		workspaceId,
		title: c ? `${faker.helpers.arrayElement(TITLES)} ${c.name}` : faker.company.buzzPhrase().replace(/^\w/, (s) => s.toUpperCase()),
		description: `${TAG} ${faker.lorem.sentences({ min: 1, max: 2 })}`,
		status,
		position,
		priority: faker.helpers.weightedArrayElement(
			TASK_PRIORITIES.map((value, i) => ({ value, weight: [3, 5, 3, 1][i] })),
		),
		assigneeId: pick(members, 0.85)?.id ?? null,
		dueAt,
		allDay,
		subjectType: c ? "contact" : null,
		subjectId: c?.id ?? null,
		completedAt: status === "done" ? new Date(Date.now() - faker.number.int({ min: 1, max: 9 }) * DAY) : null,
		createdById: owner.id,
	};
});

const activityRows = Array.from({ length: 25 }, () => {
	const type = faker.helpers.arrayElement(ACTIVITY_TYPES);
	const days = faker.number.int({ min: -14, max: 14 });
	const allDay = type === "follow_up" && faker.datatype.boolean({ probability: 0.5 });
	const startsAt = allDay ? allDayAt(days) : at(days, faker.number.int({ min: 13, max: 21 }));
	const minutes = faker.helpers.arrayElement([15, 30, 45, 60]);
	const c = pick(customers, 0.9);
	return {
		id: crypto.randomUUID(),
		workspaceId,
		type,
		subject: `${{ call: "Call with", meeting: "Meeting with", email: "Email to", follow_up: "Follow up with" }[type]} ${c?.name ?? "prospect"}`,
		notes: `${TAG} ${faker.lorem.sentence()}`,
		startsAt,
		endsAt: allDay || type === "email" ? null : new Date(startsAt.getTime() + minutes * 60_000),
		allDay,
		// Past activities are mostly done
		completed: days < 0 ? faker.datatype.boolean({ probability: 0.85 }) : false,
		ownerId: pick(members, 0.9)?.id ?? null,
		subjectType: c ? "contact" : null,
		subjectId: c?.id ?? null,
		createdById: owner.id,
	};
});

await db.batch([db.insert(task).values(taskRows), db.insert(activity).values(activityRows)]);
console.log(`Added ${taskRows.length} tasks and ${activityRows.length} activities to "${workspace.name}".`);
