import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { customer, member, salesOrder } from "#/db/schema";

// Server-only: import from server-function handlers, never from routes or
// components (plain exports aren't stripped from the browser bundle).

function badRequest(message: string) {
	return new Response(message, { status: 400 });
}

// Confirms every referenced user, customer and order belongs to this tenant, so
// a task can't be assigned to an outsider or linked to another workspace's data
export async function assertWorkspaceRefs(
	tenantId: string,
	refs: {
		userId?: string | null;
		customerId?: string | null;
		orderId?: string | null;
	},
) {
	const checks: Promise<void>[] = [];
	if (refs.userId) {
		checks.push(
			db
				.select({ id: member.id })
				.from(member)
				.where(
					and(
						eq(member.organizationId, tenantId),
						eq(member.userId, refs.userId),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw badRequest("Choose a member of this workspace");
				}),
		);
	}
	if (refs.customerId) {
		checks.push(
			db
				.select({ id: customer.id })
				.from(customer)
				.where(
					and(
						eq(customer.tenantId, tenantId),
						eq(customer.id, refs.customerId),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw badRequest("Choose a customer from this workspace");
				}),
		);
	}
	if (refs.orderId) {
		checks.push(
			db
				.select({ id: salesOrder.id })
				.from(salesOrder)
				.where(
					and(
						eq(salesOrder.tenantId, tenantId),
						eq(salesOrder.id, refs.orderId),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw badRequest("Choose an order from this workspace");
				}),
		);
	}
	await Promise.all(checks);
}
