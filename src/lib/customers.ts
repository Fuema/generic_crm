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
import { customer } from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import { COUNTRY_CODES } from "#/lib/countries";
import {
	type CustomerInput,
	customerInputSchema,
	customerSearchSchema,
} from "#/lib/schema";

// Every query is filtered by workspaceId = context.workspaceId (the caller's
// active workspace, from the session). The workspace is never taken from input.

const SORT_COLUMNS = {
	name: customer.name,
	email: customer.email,
	company: customer.company,
	status: customer.status,
	country: customer.country,
	createdAt: customer.createdAt,
} as const;

// Escape LIKE wildcards so a search for "50%" matches the literal text
function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

// Server-side checks beyond the shared schema
async function assertValid(
	data: CustomerInput,
	workspaceId: string,
	exceptId?: string,
) {
	if (data.country && !COUNTRY_CODES.includes(data.country)) {
		throw clientError(400, "Choose a country from the list");
	}
	const conditions = [
		eq(customer.workspaceId, workspaceId),
		sql`lower(${customer.email}) = ${data.email.toLowerCase()}`,
	];
	if (exceptId) conditions.push(ne(customer.id, exceptId));
	const [duplicate] = await db
		.select({ id: customer.id })
		.from(customer)
		.where(and(...conditions))
		.limit(1);
	if (duplicate) {
		throw clientError(409, "A customer with this email already exists");
	}
}

function toRow(data: CustomerInput) {
	return {
		name: data.name,
		email: data.email,
		phone: data.phone || null,
		company: data.company || null,
		status: data.status,
		city: data.city || null,
		country: data.country || null,
		notes: data.notes || null,
	};
}

export const listCustomers = createServerFn({ method: "GET" })
	.middleware([requirePermission({ customer: ["read"] })])
	.validator(customerSearchSchema)
	.handler(async ({ data, context }) => {
		const filters: SQL[] = [eq(customer.workspaceId, context.workspaceId)];
		if (data.q) {
			const pattern = likePattern(data.q);
			const search = or(
				ilike(customer.name, pattern),
				ilike(customer.email, pattern),
				ilike(customer.company, pattern),
				ilike(customer.phone, pattern),
				ilike(customer.city, pattern),
			);
			if (search) filters.push(search);
		}
		if (data.status) filters.push(eq(customer.status, data.status));
		if (data.country) filters.push(eq(customer.country, data.country));
		const where = and(...filters);

		const column = SORT_COLUMNS[data.sort];
		const order = data.dir === "asc" ? asc(column) : desc(column);

		const [rows, [{ total }]] = await Promise.all([
			db
				.select()
				.from(customer)
				.where(where)
				// id as a tie-breaker keeps pages stable when sort values repeat
				.orderBy(order, asc(customer.id))
				.limit(data.pageSize)
				.offset((data.page - 1) * data.pageSize),
			db.select({ total: count() }).from(customer).where(where),
		]);

		return {
			rows,
			total,
			pageCount: Math.max(1, Math.ceil(total / data.pageSize)),
		};
	});

export const createCustomer = createServerFn({ method: "POST" })
	.middleware([requirePermission({ customer: ["create"] })])
	.validator(customerInputSchema)
	.handler(async ({ data, context }) => {
		await assertValid(data, context.workspaceId);
		const [created] = await db
			.insert(customer)
			.values({
				id: crypto.randomUUID(),
				workspaceId: context.workspaceId,
				createdById: context.session.user.id,
				...toRow(data),
			})
			.returning();
		return created;
	});

export const updateCustomer = createServerFn({ method: "POST" })
	.middleware([requirePermission({ customer: ["update"] })])
	.validator(customerInputSchema.extend({ id: z.uuid("Invalid customer id") }))
	.handler(async ({ data, context }) => {
		await assertValid(data, context.workspaceId, data.id);
		const [updated] = await db
			.update(customer)
			.set({ ...toRow(data), updatedAt: new Date() })
			.where(
				and(
					eq(customer.id, data.id),
					eq(customer.workspaceId, context.workspaceId),
				),
			)
			.returning();
		if (!updated) throw clientError(404, "Customer not found");
		return updated;
	});

export const deleteCustomer = createServerFn({ method: "POST" })
	.middleware([requirePermission({ customer: ["delete"] })])
	.validator(z.object({ id: z.uuid("Invalid customer id") }))
	.handler(async ({ data, context }) => {
		const [deleted] = await db
			.delete(customer)
			.where(
				and(
					eq(customer.id, data.id),
					eq(customer.workspaceId, context.workspaceId),
				),
			)
			.returning({ id: customer.id });
		if (!deleted) throw clientError(404, "Customer not found");
		return deleted;
	});

export type CustomerRow = Awaited<
	ReturnType<typeof listCustomers>
>["rows"][number];
