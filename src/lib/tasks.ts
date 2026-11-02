import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, ilike, max, min, ne, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { customer, member, salesOrder, task, user } from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import {
	moveTaskSchema,
	type TaskInput,
	type TaskStatus,
	taskBoardSearchSchema,
	taskInputSchema,
} from "#/lib/schema";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";

// Every query is scoped to the caller's active workspace (context.workspaceId).

const GAP = 1024;
// Below this gap between neighbours, renumber the column to restore room
const MIN_GAP = 1e-6;

const idSchema = z.object({ id: z.uuid("Invalid task id") });

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
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
	assigneeId: task.assigneeId,
	assigneeName: user.name,
	customerId: task.customerId,
	customerName: customer.name,
	orderId: task.orderId,
	orderNumber: salesOrder.number,
	completedAt: task.completedAt,
	updatedAt: task.updatedAt,
};

function selectTasks() {
	return db
		.select(taskColumns)
		.from(task)
		.leftJoin(user, eq(user.id, task.assigneeId))
		.leftJoin(customer, eq(customer.id, task.customerId))
		.leftJoin(salesOrder, eq(salesOrder.id, task.orderId));
}

async function findTask(id: string, workspaceId: string) {
	const [row] = await db
		.select()
		.from(task)
		.where(and(eq(task.id, id), eq(task.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, "Task not found");
	return row;
}

function toRow(data: TaskInput) {
	return {
		title: data.title,
		description: data.description || null,
		priority: data.priority,
		assigneeId: data.assigneeId,
		dueAt: data.dueAt ? new Date(data.dueAt) : null,
		allDay: data.allDay,
		customerId: data.customerId,
		orderId: data.orderId,
	};
}

export const listTasks = createServerFn({ method: "GET" })
	.middleware([requirePermission({ task: ["read"] })])
	.validator(taskBoardSearchSchema)
	.handler(async ({ data, context }) => {
		const filters: SQL[] = [eq(task.workspaceId, context.workspaceId)];
		if (data.q) filters.push(ilike(task.title, likePattern(data.q)));
		if (data.assignee) {
			filters.push(
				eq(
					task.assigneeId,
					data.assignee === "me" ? context.session.user.id : data.assignee,
				),
			);
		}
		if (data.priority) filters.push(eq(task.priority, data.priority));
		return selectTasks()
			.where(and(...filters))
			.orderBy(asc(task.position), asc(task.id))
			.limit(1000);
	});

// People, customers and orders for the task and activity forms
export const getWorkspaceRefOptions = createServerFn({ method: "GET" })
	.middleware([requirePermission({ task: ["read"] })])
	.handler(async ({ context }) => {
		const workspaceId = context.workspaceId;
		const [members, customers, orders] = await Promise.all([
			db
				.select({ id: user.id, name: user.name })
				.from(member)
				.innerJoin(user, eq(user.id, member.userId))
				.where(eq(member.organizationId, workspaceId))
				.orderBy(asc(user.name)),
			db
				.select({ id: customer.id, name: customer.name })
				.from(customer)
				.where(
					and(
						eq(customer.workspaceId, workspaceId),
						ne(customer.status, "inactive"),
					),
				)
				.orderBy(asc(customer.name))
				.limit(1000),
			db
				.select({
					id: salesOrder.id,
					number: salesOrder.number,
					customerName: customer.name,
				})
				.from(salesOrder)
				.innerJoin(customer, eq(customer.id, salesOrder.customerId))
				.where(
					and(
						eq(salesOrder.workspaceId, workspaceId),
						ne(salesOrder.status, "cancelled"),
					),
				)
				.orderBy(desc(salesOrder.number))
				.limit(500),
		]);
		return {
			members,
			customers,
			orders,
			currentUserId: context.session.user.id,
		};
	});

export const createTask = createServerFn({ method: "POST" })
	.middleware([requirePermission({ task: ["create"] })])
	.validator(taskInputSchema)
	.handler(async ({ data, context }) => {
		const workspaceId = context.workspaceId;
		await assertWorkspaceRefs(workspaceId, {
			userId: data.assigneeId,
			customerId: data.customerId,
			orderId: data.orderId,
		});
		// New cards go to the top of their column
		const [{ top }] = await db
			.select({ top: min(task.position) })
			.from(task)
			.where(
				and(eq(task.workspaceId, workspaceId), eq(task.status, data.status)),
			);
		const [created] = await db
			.insert(task)
			.values({
				id: crypto.randomUUID(),
				workspaceId,
				status: data.status,
				position: (top ?? GAP) - GAP,
				completedAt: data.status === "done" ? new Date() : null,
				createdById: context.session.user.id,
				...toRow(data),
			})
			.returning({ id: task.id });
		return created;
	});

export const updateTask = createServerFn({ method: "POST" })
	.middleware([requirePermission({ task: ["update"] })])
	.validator(taskInputSchema.extend({ id: z.uuid("Invalid task id") }))
	.handler(async ({ data, context }) => {
		const existing = await findTask(data.id, context.workspaceId);
		await assertWorkspaceRefs(context.workspaceId, {
			userId: data.assigneeId,
			customerId: data.customerId,
			orderId: data.orderId,
		});
		const statusChanged = existing.status !== data.status;
		let position = existing.position;
		if (statusChanged) {
			const [{ top }] = await db
				.select({ top: min(task.position) })
				.from(task)
				.where(
					and(
						eq(task.workspaceId, context.workspaceId),
						eq(task.status, data.status),
					),
				);
			position = (top ?? GAP) - GAP;
		}
		await db
			.update(task)
			.set({
				...toRow(data),
				status: data.status,
				position,
				completedAt: completedAtFor(
					existing.status,
					data.status,
					existing.completedAt,
				),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(task.id, existing.id),
					eq(task.workspaceId, context.workspaceId),
				),
			);
		return { id: existing.id };
	});

function completedAtFor(from: string, to: string, current: Date | null) {
	if (to !== "done") return null;
	return from === "done" ? current : new Date();
}

// Drag and drop: the server computes the position from the neighbours the card
// was dropped between, so concurrent moves can't corrupt the order
export const moveTask = createServerFn({ method: "POST" })
	.middleware([requirePermission({ task: ["update"] })])
	.validator(moveTaskSchema)
	.handler(async ({ data, context }) => {
		const workspaceId = context.workspaceId;
		const moving = await findTask(data.id, workspaceId);
		const status = data.status as TaskStatus;

		const neighbour = async (id: string | null) => {
			if (!id || id === moving.id) return null;
			const [row] = await db
				.select({ position: task.position })
				.from(task)
				.where(
					and(
						eq(task.id, id),
						eq(task.workspaceId, workspaceId),
						eq(task.status, status),
					),
				)
				.limit(1);
			return row?.position ?? null;
		};

		let [above, below] = await Promise.all([
			neighbour(data.beforeId),
			neighbour(data.afterId),
		]);

		// Out of room between the two neighbours: renumber the column, then retry
		if (above !== null && below !== null && below - above < MIN_GAP) {
			const column = await db
				.select({ id: task.id })
				.from(task)
				.where(
					and(
						eq(task.workspaceId, workspaceId),
						eq(task.status, status),
						ne(task.id, moving.id),
					),
				)
				.orderBy(asc(task.position), asc(task.id));
			if (column.length) {
				await db.batch(
					column.map((t, i) =>
						db
							.update(task)
							.set({ position: (i + 1) * GAP })
							.where(eq(task.id, t.id)),
					) as unknown as Parameters<typeof db.batch>[0],
				);
			}
			[above, below] = await Promise.all([
				neighbour(data.beforeId),
				neighbour(data.afterId),
			]);
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

		await db
			.update(task)
			.set({
				status,
				position,
				completedAt: completedAtFor(moving.status, status, moving.completedAt),
				updatedAt: new Date(),
			})
			.where(and(eq(task.id, moving.id), eq(task.workspaceId, workspaceId)));
		return { id: moving.id, status, position };
	});

export const deleteTask = createServerFn({ method: "POST" })
	.middleware([requirePermission({ task: ["delete"] })])
	.validator(idSchema)
	.handler(async ({ data, context }) => {
		const [deleted] = await db
			.delete(task)
			.where(
				and(eq(task.id, data.id), eq(task.workspaceId, context.workspaceId)),
			)
			.returning({ id: task.id });
		if (!deleted) throw clientError(404, "Task not found");
		return deleted;
	});

export type TaskCard = Awaited<ReturnType<typeof listTasks>>[number];
export type RefOptions = Awaited<ReturnType<typeof getWorkspaceRefOptions>>;
