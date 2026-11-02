import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { company, customer, member, salesOrder } from "#/db/schema";
import { m } from "#/paraglide/messages.js";

// Server-only: import from server-function handlers, never from routes or
// components (plain exports aren't stripped from the browser bundle).

function badRequest(message: string) {
	return new Response(message, { status: 400 });
}

// Confirms every referenced user, company, customer and order belongs to this
// workspace, so a record can't be assigned to an outsider or linked to another
// workspace's data
export async function assertWorkspaceRefs(
	workspaceId: string,
	refs: {
		userId?: string | null;
		companyId?: string | null;
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
						eq(member.organizationId, workspaceId),
						eq(member.userId, refs.userId),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw badRequest(m.error_choose_member());
				}),
		);
	}
	if (refs.companyId) {
		checks.push(
			db
				.select({ id: company.id })
				.from(company)
				.where(
					and(
						eq(company.workspaceId, workspaceId),
						eq(company.id, refs.companyId),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw badRequest(m.error_choose_company());
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
						eq(customer.workspaceId, workspaceId),
						eq(customer.id, refs.customerId),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw badRequest(m.error_choose_customer());
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
						eq(salesOrder.workspaceId, workspaceId),
						eq(salesOrder.id, refs.orderId),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw badRequest(m.error_choose_order());
				}),
		);
	}
	await Promise.all(checks);
}
