import { createServerFn } from "@tanstack/react-start";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	inArray,
	ne,
	or,
	type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { customer, invoice, orderLine, product, salesOrder } from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import { getWorkspaceSettings, nextDocumentNumber } from "#/lib/billing.server";
import { computeTotals, parsePercentToBp } from "#/lib/money";
import {
	ORDER_STATUSES,
	type OrderInput,
	type OrderStatus,
	orderInputSchema,
	orderSearchSchema,
} from "#/lib/schema";

// Every query is scoped to the caller's active workspace (context.workspaceId).

const SORT_COLUMNS = {
	number: salesOrder.number,
	orderDate: salesOrder.orderDate,
	totalCents: salesOrder.totalCents,
	status: salesOrder.status,
} as const;

// Allowed status changes. Lines can only be edited while the order is a draft.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	draft: ["confirmed", "cancelled"],
	confirmed: ["fulfilled", "cancelled"],
	fulfilled: [],
	cancelled: [],
};

const idSchema = z.object({ id: z.uuid("Invalid order id") });

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

async function findOrder(id: string, workspaceId: string) {
	const [row] = await db
		.select()
		.from(salesOrder)
		.where(and(eq(salesOrder.id, id), eq(salesOrder.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, "Order not found");
	return row;
}

// Validates the customer and products against the workspace and prices the lines
// from the catalog (the client never sends prices)
async function priceOrder(data: OrderInput, workspaceId: string) {
	const taxRateBp = parsePercentToBp(data.taxRate);
	if (taxRateBp === null)
		throw clientError(400, "Enter a tax rate between 0 and 100");

	const [owner] = await db
		.select({ id: customer.id })
		.from(customer)
		.where(
			and(
				eq(customer.id, data.customerId),
				eq(customer.workspaceId, workspaceId),
			),
		)
		.limit(1);
	if (!owner) throw clientError(400, "Choose a customer from this workspace");

	const ids = data.lines.map((l) => l.productId);
	const products = await db
		.select()
		.from(product)
		.where(and(eq(product.workspaceId, workspaceId), inArray(product.id, ids)));
	const byId = new Map(products.map((p) => [p.id, p]));
	const lines = data.lines.map((l, position) => {
		const p = byId.get(l.productId);
		if (!p)
			throw clientError(
				400,
				"One of the products doesn't exist in this workspace",
			);
		if (!p.active)
			throw clientError(400, `"${p.name}" is inactive and can't be ordered`);
		return {
			position,
			productId: p.id,
			description: p.name,
			sku: p.sku,
			quantity: l.quantity,
			unitPriceCents: p.unitPriceCents,
		};
	});
	const totals = computeTotals(lines, taxRateBp);
	return {
		taxRateBp,
		totals,
		lines: lines.map((l, i) => ({
			...l,
			lineTotalCents: totals.lineTotals[i],
		})),
	};
}

export const listOrders = createServerFn({ method: "GET" })
	.middleware([requirePermission({ order: ["read"] })])
	.validator(orderSearchSchema)
	.handler(async ({ data, context }) => {
		const filters: SQL[] = [eq(salesOrder.workspaceId, context.workspaceId)];
		if (data.q) {
			// "ORD-0012", "12" or part of a customer's name
			const numberMatch = /^(?:ord-?)?0*(\d{1,9})$/i.exec(data.q);
			const search = or(
				ilike(customer.name, likePattern(data.q)),
				...(numberMatch ? [eq(salesOrder.number, Number(numberMatch[1]))] : []),
			);
			if (search) filters.push(search);
		}
		if (data.status) filters.push(eq(salesOrder.status, data.status));
		const where = and(...filters);
		const column = SORT_COLUMNS[data.sort];
		const [rows, [{ total }]] = await Promise.all([
			db
				.select({
					id: salesOrder.id,
					number: salesOrder.number,
					status: salesOrder.status,
					orderDate: salesOrder.orderDate,
					currency: salesOrder.currency,
					totalCents: salesOrder.totalCents,
					customerName: customer.name,
					invoiceId: invoice.id,
				})
				.from(salesOrder)
				.innerJoin(customer, eq(customer.id, salesOrder.customerId))
				.leftJoin(invoice, eq(invoice.orderId, salesOrder.id))
				.where(where)
				.orderBy(
					data.dir === "asc" ? asc(column) : desc(column),
					asc(salesOrder.id),
				)
				.limit(data.pageSize)
				.offset((data.page - 1) * data.pageSize),
			db
				.select({ total: count() })
				.from(salesOrder)
				.innerJoin(customer, eq(customer.id, salesOrder.customerId))
				.where(where),
		]);
		return {
			rows,
			total,
			pageCount: Math.max(1, Math.ceil(total / data.pageSize)),
		};
	});

export const getOrder = createServerFn({ method: "GET" })
	.middleware([requirePermission({ order: ["read"] })])
	.validator(idSchema)
	.handler(async ({ data, context }) => {
		const order = await findOrder(data.id, context.workspaceId);
		const [[buyer], lines, [linkedInvoice]] = await Promise.all([
			db
				.select({
					id: customer.id,
					name: customer.name,
					email: customer.email,
					company: customer.company,
				})
				.from(customer)
				.where(eq(customer.id, order.customerId)),
			db
				.select()
				.from(orderLine)
				.where(eq(orderLine.orderId, order.id))
				.orderBy(asc(orderLine.position)),
			db
				.select({
					id: invoice.id,
					status: invoice.status,
					year: invoice.year,
					number: invoice.number,
				})
				.from(invoice)
				.where(eq(invoice.orderId, order.id)),
		]);
		return { order, customer: buyer, lines, invoice: linkedInvoice ?? null };
	});

// Customers for the order form's picker
export const listOrderCustomers = createServerFn({ method: "GET" })
	.middleware([requirePermission({ order: ["create"], customer: ["read"] })])
	.handler(async ({ context }) => {
		return db
			.select({ id: customer.id, name: customer.name, email: customer.email })
			.from(customer)
			.where(
				and(
					eq(customer.workspaceId, context.workspaceId),
					ne(customer.status, "inactive"),
				),
			)
			.orderBy(asc(customer.name))
			.limit(1000);
	});

export const createOrder = createServerFn({ method: "POST" })
	.middleware([requirePermission({ order: ["create"] })])
	.validator(orderInputSchema)
	.handler(async ({ data, context }) => {
		const workspaceId = context.workspaceId;
		const [{ lines, totals, taxRateBp }, settings] = await Promise.all([
			priceOrder(data, workspaceId),
			getWorkspaceSettings(workspaceId),
		]);
		const number = await nextDocumentNumber(workspaceId, "order");
		const id = crypto.randomUUID();
		// neon-http has no interactive transactions; batch runs both inserts atomically
		await db.batch([
			db.insert(salesOrder).values({
				id,
				workspaceId,
				number,
				customerId: data.customerId,
				currency: settings.currency,
				taxRateBp,
				subtotalCents: totals.subtotalCents,
				taxCents: totals.taxCents,
				totalCents: totals.totalCents,
				notes: data.notes || null,
				createdById: context.session.user.id,
			}),
			db
				.insert(orderLine)
				.values(
					lines.map((l) => ({ id: crypto.randomUUID(), orderId: id, ...l })),
				),
		]);
		return { id, number };
	});

export const updateOrder = createServerFn({ method: "POST" })
	.middleware([requirePermission({ order: ["update"] })])
	.validator(orderInputSchema.extend({ id: z.uuid("Invalid order id") }))
	.handler(async ({ data, context }) => {
		const order = await findOrder(data.id, context.workspaceId);
		if (order.status !== "draft")
			throw clientError(409, "Only draft orders can be edited");
		const { lines, totals, taxRateBp } = await priceOrder(
			data,
			context.workspaceId,
		);
		await db.batch([
			db
				.update(salesOrder)
				.set({
					customerId: data.customerId,
					taxRateBp,
					subtotalCents: totals.subtotalCents,
					taxCents: totals.taxCents,
					totalCents: totals.totalCents,
					notes: data.notes || null,
					updatedAt: new Date(),
				})
				.where(
					and(eq(salesOrder.id, order.id), eq(salesOrder.status, "draft")),
				),
			db.delete(orderLine).where(eq(orderLine.orderId, order.id)),
			db.insert(orderLine).values(
				lines.map((l) => ({
					id: crypto.randomUUID(),
					orderId: order.id,
					...l,
				})),
			),
		]);
		return { id: order.id };
	});

export const setOrderStatus = createServerFn({ method: "POST" })
	.middleware([requirePermission({ order: ["update"] })])
	.validator(idSchema.extend({ status: z.enum(ORDER_STATUSES) }))
	.handler(async ({ data, context }) => {
		const order = await findOrder(data.id, context.workspaceId);
		const from = order.status as OrderStatus;
		if (!TRANSITIONS[from]?.includes(data.status)) {
			throw clientError(
				409,
				`A ${from} order can't be changed to ${data.status}`,
			);
		}
		if (data.status === "cancelled") {
			const [active] = await db
				.select({ id: invoice.id })
				.from(invoice)
				.where(and(eq(invoice.orderId, order.id), ne(invoice.status, "void")))
				.limit(1);
			if (active)
				throw clientError(409, "Void the order's invoice before cancelling it");
		}
		const [updated] = await db
			.update(salesOrder)
			.set({ status: data.status, updatedAt: new Date() })
			// Guard against a concurrent change between the read and the write
			.where(and(eq(salesOrder.id, order.id), eq(salesOrder.status, from)))
			.returning({ id: salesOrder.id });
		if (!updated)
			throw clientError(
				409,
				"The order changed meanwhile. Reload and try again.",
			);
		return updated;
	});

export const deleteOrder = createServerFn({ method: "POST" })
	.middleware([requirePermission({ order: ["delete"] })])
	.validator(idSchema)
	.handler(async ({ data, context }) => {
		const order = await findOrder(data.id, context.workspaceId);
		if (order.status !== "draft" && order.status !== "cancelled") {
			throw clientError(409, "Only draft or cancelled orders can be deleted");
		}
		const [linked] = await db
			.select({ id: invoice.id })
			.from(invoice)
			.where(eq(invoice.orderId, order.id))
			.limit(1);
		if (linked)
			throw clientError(
				409,
				"This order has an invoice and is kept for the record",
			);
		await db.delete(salesOrder).where(eq(salesOrder.id, order.id));
		return { id: order.id };
	});

export type OrderListRow = Awaited<
	ReturnType<typeof listOrders>
>["rows"][number];
export type OrderDetail = Awaited<ReturnType<typeof getOrder>>;
export type OrderCustomerOption = Awaited<
	ReturnType<typeof listOrderCustomers>
>[number];
