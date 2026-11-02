import { createServerFn } from "@tanstack/react-start";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { orderLine, product } from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import { parseMoneyToCents } from "#/lib/money";
import {
	type ProductInput,
	productInputSchema,
	productSearchSchema,
} from "#/lib/schema";

// All queries are scoped to the caller's active workspace (context.organizationId)

const SORT_COLUMNS = {
	name: product.name,
	sku: product.sku,
	unitPriceCents: product.unitPriceCents,
	createdAt: product.createdAt,
} as const;

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

async function toRow(data: ProductInput, tenantId: string, exceptId?: string) {
	const unitPriceCents = parseMoneyToCents(data.price);
	if (unitPriceCents === null)
		throw clientError(400, "Enter a price like 19.99");
	const conditions = [
		eq(product.tenantId, tenantId),
		sql`lower(${product.sku}) = ${data.sku.toLowerCase()}`,
	];
	if (exceptId) conditions.push(ne(product.id, exceptId));
	const [duplicate] = await db
		.select({ id: product.id })
		.from(product)
		.where(and(...conditions))
		.limit(1);
	if (duplicate)
		throw clientError(409, "A product with this SKU already exists");
	return {
		name: data.name,
		sku: data.sku,
		description: data.description || null,
		unitPriceCents,
		active: data.active,
	};
}

export const listProducts = createServerFn({ method: "GET" })
	.middleware([requirePermission({ product: ["read"] })])
	.validator(productSearchSchema)
	.handler(async ({ data, context }) => {
		const filters: SQL[] = [eq(product.tenantId, context.organizationId)];
		if (data.q) {
			const pattern = likePattern(data.q);
			const search = or(
				ilike(product.name, pattern),
				ilike(product.sku, pattern),
			);
			if (search) filters.push(search);
		}
		if (data.status) filters.push(eq(product.active, data.status === "active"));
		const where = and(...filters);
		const column = SORT_COLUMNS[data.sort];
		const [rows, [{ total }]] = await Promise.all([
			db
				.select()
				.from(product)
				.where(where)
				.orderBy(
					data.dir === "asc" ? asc(column) : desc(column),
					asc(product.id),
				)
				.limit(data.pageSize)
				.offset((data.page - 1) * data.pageSize),
			db.select({ total: count() }).from(product).where(where),
		]);
		return {
			rows,
			total,
			pageCount: Math.max(1, Math.ceil(total / data.pageSize)),
		};
	});

// Active products for the order line picker
export const listActiveProducts = createServerFn({ method: "GET" })
	.middleware([requirePermission({ product: ["read"] })])
	.handler(async ({ context }) => {
		return db
			.select({
				id: product.id,
				name: product.name,
				sku: product.sku,
				unitPriceCents: product.unitPriceCents,
			})
			.from(product)
			.where(
				and(
					eq(product.tenantId, context.organizationId),
					eq(product.active, true),
				),
			)
			.orderBy(asc(product.name))
			.limit(1000);
	});

export const createProduct = createServerFn({ method: "POST" })
	.middleware([requirePermission({ product: ["create"] })])
	.validator(productInputSchema)
	.handler(async ({ data, context }) => {
		const values = await toRow(data, context.organizationId);
		const [created] = await db
			.insert(product)
			.values({
				id: crypto.randomUUID(),
				tenantId: context.organizationId,
				...values,
			})
			.returning();
		return created;
	});

export const updateProduct = createServerFn({ method: "POST" })
	.middleware([requirePermission({ product: ["update"] })])
	.validator(productInputSchema.extend({ id: z.uuid("Invalid product id") }))
	.handler(async ({ data, context }) => {
		const values = await toRow(data, context.organizationId, data.id);
		const [updated] = await db
			.update(product)
			.set({ ...values, updatedAt: new Date() })
			.where(
				and(
					eq(product.id, data.id),
					eq(product.tenantId, context.organizationId),
				),
			)
			.returning();
		if (!updated) throw clientError(404, "Product not found");
		return updated;
	});

export const deleteProduct = createServerFn({ method: "POST" })
	.middleware([requirePermission({ product: ["delete"] })])
	.validator(z.object({ id: z.uuid("Invalid product id") }))
	.handler(async ({ data, context }) => {
		const [owned] = await db
			.select({ id: product.id })
			.from(product)
			.where(
				and(
					eq(product.id, data.id),
					eq(product.tenantId, context.organizationId),
				),
			)
			.limit(1);
		if (!owned) throw clientError(404, "Product not found");
		// Products used on orders are kept for the record: deactivate them instead
		const [used] = await db
			.select({ id: orderLine.id })
			.from(orderLine)
			.where(eq(orderLine.productId, data.id))
			.limit(1);
		if (used) {
			throw clientError(
				409,
				"This product is used on orders. Mark it inactive instead of deleting it.",
			);
		}
		const [deleted] = await db
			.delete(product)
			.where(
				and(
					eq(product.id, data.id),
					eq(product.tenantId, context.organizationId),
				),
			)
			.returning({ id: product.id });
		if (!deleted) throw clientError(404, "Product not found");
		return deleted;
	});

export type ProductRow = Awaited<
	ReturnType<typeof listProducts>
>["rows"][number];
export type ProductOption = Awaited<
	ReturnType<typeof listActiveProducts>
>[number];
