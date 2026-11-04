import { createServerFn } from "@tanstack/react-start";
import { requirePermission } from "#/lib/authz";
import * as data from "./orders.server";
import {
	createOrderSchema,
	orderActionSchema,
	orderIdSchema,
	orderSearchSchema,
	relatedOrdersSchema,
	updateOrderSchema,
} from "./schema";

// Server functions for orders. Each checks the caller's role and validates its
// input, then calls the data layer with the workspace from the session
// (context.workspaceId), never from input.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listOrders = createServerFn({ method: "GET" })
	.middleware([requirePermission({ order: ["read"] })])
	.validator(orderSearchSchema)
	.handler(({ data: search, context }) =>
		data.listOrders(context.workspaceId, search),
	);

export const getOrder = createServerFn({ method: "GET" })
	.middleware([requirePermission({ order: ["read"] })])
	.validator(orderIdSchema)
	.handler(({ data: { id }, context }) =>
		data.getOrderDetail(context.workspaceId, id),
	);

export const createOrder = createServerFn({ method: "POST" })
	.middleware([requirePermission({ order: ["create"] })])
	.validator(createOrderSchema)
	.handler(({ data: input, context }) =>
		data.createOrder(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateOrder = createServerFn({ method: "POST" })
	.middleware([requirePermission({ order: ["update"] })])
	.validator(updateOrderSchema)
	.handler(({ data: input, context }) =>
		data.updateOrder(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const changeOrderStatus = createServerFn({ method: "POST" })
	.middleware([requirePermission({ order: ["update"] })])
	.validator(orderActionSchema)
	.handler(({ data: { id, action }, context }) =>
		data.changeOrderStatus(
			context.workspaceId,
			member(context.session.user.id),
			id,
			action,
		),
	);

export const archiveOrder = createServerFn({ method: "POST" })
	.middleware([requirePermission({ order: ["delete"] })])
	.validator(orderIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setOrderArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			true,
		),
	);

export const restoreOrder = createServerFn({ method: "POST" })
	.middleware([requirePermission({ order: ["delete"] })])
	.validator(orderIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setOrderArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			false,
		),
	);

export const listRelatedOrders = createServerFn({ method: "GET" })
	.middleware([requirePermission({ order: ["read"] })])
	.validator(relatedOrdersSchema)
	.handler(({ data: refs, context }) =>
		data.relatedOrders(context.workspaceId, refs),
	);

export type OrderDetail = Awaited<ReturnType<typeof getOrder>>;
export type OrderRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];
