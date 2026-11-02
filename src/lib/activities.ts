import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gte, isNotNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "#/db/index";
import { activity, customer, salesOrder, task, user } from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import {
	type ActivityInput,
	activityInputSchema,
	calendarRangeSchema,
} from "#/lib/schema";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";

// Every query is scoped to the caller's active workspace (context.organizationId).

const idSchema = z.object({ id: z.uuid("Invalid activity id") });
const owner = alias(user, "owner");

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function toRow(data: ActivityInput) {
	return {
		type: data.type,
		subject: data.subject,
		notes: data.notes || null,
		startsAt: new Date(data.startsAt),
		endsAt: data.endsAt ? new Date(data.endsAt) : null,
		allDay: data.allDay,
		completed: data.completed,
		ownerId: data.ownerId,
		customerId: data.customerId,
		orderId: data.orderId,
	};
}

// Tasks with a due date and activities in [from, to), for the calendar views
export const listCalendar = createServerFn({ method: "GET" })
	.middleware([requirePermission({ task: ["read"], activity: ["read"] })])
	.validator(calendarRangeSchema)
	.handler(async ({ data, context }) => {
		const tenantId = context.organizationId;
		const from = new Date(data.from);
		const to = new Date(data.to);
		const [tasks, activities] = await Promise.all([
			db
				.select({
					id: task.id,
					title: task.title,
					status: task.status,
					priority: task.priority,
					dueAt: task.dueAt,
					allDay: task.allDay,
					assigneeName: user.name,
					customerName: customer.name,
				})
				.from(task)
				.leftJoin(user, eq(user.id, task.assigneeId))
				.leftJoin(customer, eq(customer.id, task.customerId))
				.where(
					and(
						eq(task.tenantId, tenantId),
						isNotNull(task.dueAt),
						gte(task.dueAt, from),
						lt(task.dueAt, to),
					),
				)
				.orderBy(asc(task.dueAt))
				.limit(1000),
			db
				.select({
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
					customerId: activity.customerId,
					customerName: customer.name,
					orderId: activity.orderId,
					orderNumber: salesOrder.number,
				})
				.from(activity)
				.leftJoin(owner, eq(owner.id, activity.ownerId))
				.leftJoin(customer, eq(customer.id, activity.customerId))
				.leftJoin(salesOrder, eq(salesOrder.id, activity.orderId))
				.where(
					and(
						eq(activity.tenantId, tenantId),
						gte(activity.startsAt, from),
						lt(activity.startsAt, to),
					),
				)
				.orderBy(asc(activity.startsAt))
				.limit(1000),
		]);
		return { tasks, activities };
	});

export const createActivity = createServerFn({ method: "POST" })
	.middleware([requirePermission({ activity: ["create"] })])
	.validator(activityInputSchema)
	.handler(async ({ data, context }) => {
		await assertWorkspaceRefs(context.organizationId, {
			userId: data.ownerId,
			customerId: data.customerId,
			orderId: data.orderId,
		});
		const [created] = await db
			.insert(activity)
			.values({
				id: crypto.randomUUID(),
				tenantId: context.organizationId,
				createdById: context.session.user.id,
				...toRow(data),
			})
			.returning({ id: activity.id });
		return created;
	});

export const updateActivity = createServerFn({ method: "POST" })
	.middleware([requirePermission({ activity: ["update"] })])
	.validator(activityInputSchema.and(idSchema))
	.handler(async ({ data, context }) => {
		await assertWorkspaceRefs(context.organizationId, {
			userId: data.ownerId,
			customerId: data.customerId,
			orderId: data.orderId,
		});
		const [updated] = await db
			.update(activity)
			.set({ ...toRow(data), updatedAt: new Date() })
			.where(
				and(
					eq(activity.id, data.id),
					eq(activity.tenantId, context.organizationId),
				),
			)
			.returning({ id: activity.id });
		if (!updated) throw clientError(404, "Activity not found");
		return updated;
	});

export const deleteActivity = createServerFn({ method: "POST" })
	.middleware([requirePermission({ activity: ["delete"] })])
	.validator(idSchema)
	.handler(async ({ data, context }) => {
		const [deleted] = await db
			.delete(activity)
			.where(
				and(
					eq(activity.id, data.id),
					eq(activity.tenantId, context.organizationId),
				),
			)
			.returning({ id: activity.id });
		if (!deleted) throw clientError(404, "Activity not found");
		return deleted;
	});

export type CalendarData = Awaited<ReturnType<typeof listCalendar>>;
export type CalendarTask = CalendarData["tasks"][number];
export type CalendarActivity = CalendarData["activities"][number];
