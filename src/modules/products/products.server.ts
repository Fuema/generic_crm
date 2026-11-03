import {
	and,
	asc,
	count,
	eq,
	ilike,
	isNotNull,
	isNull,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { db } from "#/db/index";
import { product } from "#/db/schema";
import {
	customChanges,
	listFields,
	prepareCustom,
} from "#/modules/fields/fields.server";
import {
	filterConditions,
	sortExpression,
} from "#/modules/views/filters.server";
import { m } from "#/paraglide/messages.js";
import {
	type Actor,
	changedFields,
	eventInsert,
} from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import type { ProductInput, ProductSearch } from "./schema";

// Server-only data layer for the product catalog. Every function takes the
// workspace id first and filters by it; the server functions in products.ts
// pass context.workspaceId from the session, never a value from input. Writes
// put the change and its event in one db.batch (spec §11.1). Products are
// archived, never deleted: documents keep a copy of what they sold.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function errorCode(error: unknown) {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code ?? e?.cause?.code;
}

// The first statements of a write batch: lock the product row, then fail the
// whole batch (division by zero, so the event is rolled back too) unless it is
// still in the state the write expects. A concurrent archive or edit waits for
// the lock and then sees the committed state.
function lockAndCheck(workspaceId: string, id: string, archived: boolean) {
	return [
		db
			.select({ id: product.id })
			.from(product)
			.where(and(eq(product.id, id), eq(product.workspaceId, workspaceId)))
			.for("update"),
		db
			.select({
				ok: sql<number>`1 / (case when exists (select 1 from "product" p where p."id" = ${id} and p."workspace_id" = ${workspaceId} and p."archived_at" is ${sql.raw(archived ? "not null" : "null")}) then 1 else 0 end)`,
			})
			.from(product)
			.where(and(eq(product.id, id), eq(product.workspaceId, workspaceId))),
	] as const;
}

async function runBatch(statements: unknown[]) {
	try {
		await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
	} catch (error) {
		const code = errorCode(error);
		if (code === "23505") throw clientError(409, m.error_sku_taken());
		if (code === "22012") throw clientError(409, m.error_product_changed());
		throw error;
	}
}

const PRODUCT_SORT = {
	name: product.name,
	sku: product.sku,
	unitPriceCents: product.unitPriceCents,
	createdAt: product.createdAt,
} as const;

export async function listProducts(workspaceId: string, search: ProductSearch) {
	const filters: SQL[] = [
		eq(product.workspaceId, workspaceId),
		search.show === "archived"
			? isNotNull(product.archivedAt)
			: isNull(product.archivedAt),
	];
	if (search.q) {
		const pattern = likePattern(search.q);
		const match = or(
			ilike(product.name, pattern),
			ilike(product.sku, pattern),
			ilike(product.description, pattern),
		);
		if (match) filters.push(match);
	}
	const { fields } = await listFields(workspaceId, "product", {
		includeArchived: false,
	});
	filters.push(...filterConditions("product", search.filters, fields));
	const where = and(...filters);
	const order = sortExpression(
		"product",
		{ field: search.sort, dir: search.dir },
		fields,
		PRODUCT_SORT,
	);
	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				id: product.id,
				name: product.name,
				sku: product.sku,
				description: product.description,
				unitPriceCents: product.unitPriceCents,
				custom: product.custom,
				archivedAt: product.archivedAt,
				createdAt: product.createdAt,
			})
			.from(product)
			.where(where)
			.orderBy(order, asc(product.id))
			.limit(search.pageSize)
			.offset((search.page - 1) * search.pageSize),
		db.select({ total: count() }).from(product).where(where),
	]);
	return {
		rows,
		total,
		pageCount: Math.max(1, Math.ceil(total / search.pageSize)),
	};
}

// Active products for a document's line picker, by name, SKU or description
export async function pickProducts(workspaceId: string, q: string) {
	const filters: SQL[] = [
		eq(product.workspaceId, workspaceId),
		isNull(product.archivedAt),
	];
	if (q) {
		const pattern = likePattern(q);
		const match = or(ilike(product.name, pattern), ilike(product.sku, pattern));
		if (match) filters.push(match);
	}
	return db
		.select({
			id: product.id,
			name: product.name,
			sku: product.sku,
			description: product.description,
			unitPriceCents: product.unitPriceCents,
		})
		.from(product)
		.where(and(...filters))
		.orderBy(asc(product.name))
		.limit(q ? 20 : 1000);
}

async function findProduct(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(product)
		.where(and(eq(product.id, id), eq(product.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_product_not_found());
	return row;
}

// SKUs are unique per workspace, ignoring case (archived products included,
// since documents refer to them)
async function assertSkuFree(
	workspaceId: string,
	sku: string,
	exceptId?: string,
) {
	const [taken] = await db
		.select({ id: product.id })
		.from(product)
		.where(
			and(
				eq(product.workspaceId, workspaceId),
				sql`lower(${product.sku}) = ${sku.toLowerCase()}`,
				exceptId ? ne(product.id, exceptId) : undefined,
			),
		)
		.limit(1);
	if (taken) throw clientError(409, m.error_sku_taken());
}

function productRow(data: ProductInput) {
	return {
		name: data.name,
		sku: data.sku,
		description: data.description || null,
		unitPriceCents: data.unitPriceCents,
	};
}

export async function createProduct(
	workspaceId: string,
	actor: Actor,
	data: ProductInput,
) {
	await assertSkuFree(workspaceId, data.sku);
	const custom = await prepareCustom(workspaceId, "product", data.custom ?? {});
	const id = uuidv7();
	await runBatch([
		db.insert(product).values({
			id,
			workspaceId,
			...productRow(data),
			custom,
		}),
		eventInsert(workspaceId, actor, {
			type: "product.created",
			subjectType: "product",
			subjectId: id,
		}),
	]);
	return { id };
}

export async function updateProduct(
	workspaceId: string,
	actor: Actor,
	id: string,
	data: ProductInput,
) {
	const before = await findProduct(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	await assertSkuFree(workspaceId, data.sku, id);
	const custom =
		data.custom === undefined
			? before.custom
			: await prepareCustom(
					workspaceId,
					"product",
					data.custom,
					before.custom,
					id,
				);
	const values = productRow(data);
	const changes = {
		...changedFields(before, values),
		...customChanges(before.custom, custom),
	};
	if (!Object.keys(changes).length) return { id };
	// Not archived meanwhile
	await runBatch([
		...lockAndCheck(workspaceId, id, false),
		db
			.update(product)
			.set({ ...values, custom, updatedAt: new Date() })
			.where(
				and(
					eq(product.id, id),
					eq(product.workspaceId, workspaceId),
					isNull(product.archivedAt),
				),
			),
		eventInsert(workspaceId, actor, {
			type: "product.updated",
			subjectType: "product",
			subjectId: id,
			payload: { changes },
		}),
	]);
	return { id };
}

export async function setProductArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findProduct(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	// Still in the state we read: two archives at once write one event
	await runBatch([
		...lockAndCheck(workspaceId, id, !archived),
		db
			.update(product)
			.set({
				archivedAt: archived ? new Date() : null,
				active: !archived,
				updatedAt: new Date(),
			})
			.where(and(eq(product.id, id), eq(product.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: archived ? "product.archived" : "product.restored",
			subjectType: "product",
			subjectId: id,
		}),
	]);
	return { id };
}
