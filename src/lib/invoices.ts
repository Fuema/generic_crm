import { createServerFn } from "@tanstack/react-start";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	lt,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import {
	customer,
	invoice,
	invoiceLine,
	orderLine,
	organization,
	salesOrder,
} from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import { getTenantSettings, nextDocumentNumber } from "#/lib/billing.server";
import { invoiceSearchSchema } from "#/lib/schema";

// Every query is scoped to the caller's active workspace (context.organizationId).
// Lifecycle: draft -> issued -> paid, and draft/issued -> void. Issued and paid
// invoices are never edited or deleted, only voided, so the record stays intact.

const DAY = 24 * 60 * 60 * 1000;

const SORT_COLUMNS = {
	number: invoice.number,
	issueDate: invoice.issueDate,
	dueDate: invoice.dueDate,
	totalCents: invoice.totalCents,
	status: invoice.status,
} as const;

const idSchema = z.object({ id: z.uuid("Invalid invoice id") });

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

async function findInvoice(id: string, tenantId: string) {
	const [row] = await db
		.select()
		.from(invoice)
		.where(and(eq(invoice.id, id), eq(invoice.tenantId, tenantId)))
		.limit(1);
	if (!row) throw clientError(404, "Invoice not found");
	return row;
}

// Moves an invoice from one status to another only if nobody changed it meanwhile
async function transition(
	id: string,
	from: string[],
	set: Partial<typeof invoice.$inferInsert>,
) {
	const [updated] = await db
		.update(invoice)
		.set({ ...set, updatedAt: new Date() })
		.where(
			and(eq(invoice.id, id), or(...from.map((s) => eq(invoice.status, s)))),
		)
		.returning({ id: invoice.id });
	if (!updated)
		throw clientError(
			409,
			"The invoice changed meanwhile. Reload and try again.",
		);
	return updated;
}

export const listInvoices = createServerFn({ method: "GET" })
	.middleware([requirePermission({ invoice: ["read"] })])
	.validator(invoiceSearchSchema)
	.handler(async ({ data, context }) => {
		const filters: SQL[] = [eq(invoice.tenantId, context.organizationId)];
		if (data.q) {
			// "INV-2026-0003", "3" or part of a customer's name
			const numberMatch = /^(?:inv-?)?(?:(\d{4})-)?0*(\d{1,9})$/i.exec(data.q);
			const search = or(
				ilike(customer.name, likePattern(data.q)),
				...(numberMatch
					? [
							numberMatch[1]
								? and(
										eq(invoice.year, Number(numberMatch[1])),
										eq(invoice.number, Number(numberMatch[2])),
									)
								: eq(invoice.number, Number(numberMatch[2])),
						]
					: []),
			);
			if (search) filters.push(search);
		}
		if (data.status === "overdue") {
			filters.push(
				eq(invoice.status, "issued"),
				lt(invoice.dueDate, new Date()),
			);
		} else if (data.status) {
			filters.push(eq(invoice.status, data.status));
		}
		const where = and(...filters);
		const column = SORT_COLUMNS[data.sort];
		// Drafts have no number or dates yet; keep them at the end either way
		const order =
			data.dir === "asc"
				? sql`${column} asc nulls last`
				: sql`${column} desc nulls last`;
		const [rows, [{ total }]] = await Promise.all([
			db
				.select({
					id: invoice.id,
					year: invoice.year,
					number: invoice.number,
					status: invoice.status,
					issueDate: invoice.issueDate,
					dueDate: invoice.dueDate,
					currency: invoice.currency,
					totalCents: invoice.totalCents,
					customerName: customer.name,
					orderNumber: salesOrder.number,
				})
				.from(invoice)
				.innerJoin(customer, eq(customer.id, invoice.customerId))
				.innerJoin(salesOrder, eq(salesOrder.id, invoice.orderId))
				.where(where)
				.orderBy(order, desc(invoice.createdAt), asc(invoice.id))
				.limit(data.pageSize)
				.offset((data.page - 1) * data.pageSize),
			db
				.select({ total: count() })
				.from(invoice)
				.innerJoin(customer, eq(customer.id, invoice.customerId))
				.where(where),
		]);
		return {
			rows,
			total,
			pageCount: Math.max(1, Math.ceil(total / data.pageSize)),
		};
	});

export const getInvoice = createServerFn({ method: "GET" })
	.middleware([requirePermission({ invoice: ["read"] })])
	.validator(idSchema)
	.handler(async ({ data, context }) => {
		const inv = await findInvoice(data.id, context.organizationId);
		const [[buyer], lines, [order], [seller]] = await Promise.all([
			db.select().from(customer).where(eq(customer.id, inv.customerId)),
			db
				.select()
				.from(invoiceLine)
				.where(eq(invoiceLine.invoiceId, inv.id))
				.orderBy(asc(invoiceLine.position)),
			db
				.select({ id: salesOrder.id, number: salesOrder.number })
				.from(salesOrder)
				.where(eq(salesOrder.id, inv.orderId)),
			db
				.select({ name: organization.name })
				.from(organization)
				.where(eq(organization.id, inv.tenantId)),
		]);
		return { invoice: inv, customer: buyer, lines, order, seller };
	});

export const createInvoiceFromOrder = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["create"] })])
	.validator(z.object({ orderId: z.uuid("Invalid order id") }))
	.handler(async ({ data, context }) => {
		const [order] = await db
			.select()
			.from(salesOrder)
			.where(
				and(
					eq(salesOrder.id, data.orderId),
					eq(salesOrder.tenantId, context.organizationId),
				),
			)
			.limit(1);
		if (!order) throw clientError(404, "Order not found");
		if (order.status !== "confirmed" && order.status !== "fulfilled") {
			throw clientError(409, "Confirm the order before invoicing it");
		}
		const [existing] = await db
			.select({ id: invoice.id })
			.from(invoice)
			.where(eq(invoice.orderId, order.id))
			.limit(1);
		if (existing) throw clientError(409, "This order already has an invoice");

		const lines = await db
			.select()
			.from(orderLine)
			.where(eq(orderLine.orderId, order.id))
			.orderBy(asc(orderLine.position));
		const id = crypto.randomUUID();
		await db.batch([
			db.insert(invoice).values({
				id,
				tenantId: context.organizationId,
				orderId: order.id,
				customerId: order.customerId,
				currency: order.currency,
				taxRateBp: order.taxRateBp,
				subtotalCents: order.subtotalCents,
				taxCents: order.taxCents,
				totalCents: order.totalCents,
				notes: order.notes,
				createdById: context.session.user.id,
			}),
			db.insert(invoiceLine).values(
				lines.map((l) => ({
					id: crypto.randomUUID(),
					invoiceId: id,
					position: l.position,
					description: l.description,
					sku: l.sku,
					quantity: l.quantity,
					unitPriceCents: l.unitPriceCents,
					lineTotalCents: l.lineTotalCents,
				})),
			),
		]);
		return { id };
	});

export const updateInvoiceNotes = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["update"] })])
	.validator(
		idSchema.extend({
			notes: z
				.string()
				.trim()
				.max(1000, "Notes must not exceed 1000 characters"),
		}),
	)
	.handler(async ({ data, context }) => {
		const inv = await findInvoice(data.id, context.organizationId);
		if (inv.status !== "draft")
			throw clientError(409, "Only draft invoices can be edited");
		return transition(inv.id, ["draft"], { notes: data.notes || null });
	});

// Finalizes a draft: assigns the next number for this year and sets the due date
export const issueInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["issue"] })])
	.validator(idSchema)
	.handler(async ({ data, context }) => {
		const inv = await findInvoice(data.id, context.organizationId);
		if (inv.status !== "draft")
			throw clientError(409, "Only draft invoices can be issued");
		const now = new Date();
		const year = now.getUTCFullYear();
		const settings = await getTenantSettings(context.organizationId);
		const number = await nextDocumentNumber(
			context.organizationId,
			"invoice",
			year,
		);
		return transition(inv.id, ["draft"], {
			status: "issued",
			year,
			number,
			issueDate: now,
			dueDate: new Date(now.getTime() + settings.paymentTermsDays * DAY),
		});
	});

export const markInvoicePaid = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["pay"] })])
	.validator(idSchema)
	.handler(async ({ data, context }) => {
		const inv = await findInvoice(data.id, context.organizationId);
		if (inv.status !== "issued")
			throw clientError(409, "Only issued invoices can be marked as paid");
		return transition(inv.id, ["issued"], {
			status: "paid",
			paidAt: new Date(),
		});
	});

export const voidInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["void"] })])
	.validator(idSchema)
	.handler(async ({ data, context }) => {
		const inv = await findInvoice(data.id, context.organizationId);
		if (inv.status !== "draft" && inv.status !== "issued") {
			throw clientError(409, "Only draft or issued invoices can be voided");
		}
		return transition(inv.id, ["draft", "issued"], {
			status: "void",
			voidedAt: new Date(),
		});
	});

export const deleteInvoice = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["delete"] })])
	.validator(idSchema)
	.handler(async ({ data, context }) => {
		const inv = await findInvoice(data.id, context.organizationId);
		if (inv.status !== "draft") {
			throw clientError(
				409,
				"Only drafts can be deleted; void an issued invoice instead",
			);
		}
		await db
			.delete(invoice)
			.where(and(eq(invoice.id, inv.id), eq(invoice.status, "draft")));
		return { id: inv.id };
	});

export type InvoiceListRow = Awaited<
	ReturnType<typeof listInvoices>
>["rows"][number];
export type InvoiceDetail = Awaited<ReturnType<typeof getInvoice>>;
