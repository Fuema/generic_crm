import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { customer, invitation, member, project } from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import { CUSTOMER_STATUSES, type CustomerStatus } from "#/lib/schema";

const DAY = 24 * 60 * 60 * 1000;
const TOP_COUNTRIES = 5;

// First day of each of the last 12 months, oldest first, as "YYYY-MM"
function lastTwelveMonths(now: Date) {
	return Array.from({ length: 12 }, (_, i) => {
		const d = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1),
		);
		return d.toISOString().slice(0, 7);
	});
}

// KPIs for the active workspace. Every query is scoped to the tenant from the
// session; viewers can see it because it only needs read permissions.
export const getDashboardStats = createServerFn({ method: "GET" })
	.middleware([requirePermission({ customer: ["read"], project: ["read"] })])
	.handler(async ({ context }) => {
		const tenant = context.organizationId;
		const now = new Date();
		const last30 = new Date(now.getTime() - 30 * DAY);
		const prev30 = new Date(now.getTime() - 60 * DAY);
		const months = lastTwelveMonths(now);
		const monthsStart = new Date(`${months[0]}-01T00:00:00Z`);
		const inTenant = eq(customer.tenantId, tenant);
		const month = sql<string>`to_char(date_trunc('month', ${customer.createdAt}), 'YYYY-MM')`;

		const [
			byStatus,
			[newLast30],
			[newPrev30],
			monthly,
			countries,
			[projects],
			[members],
			[pending],
		] = await Promise.all([
			db
				.select({ status: customer.status, n: count() })
				.from(customer)
				.where(inTenant)
				.groupBy(customer.status),
			db
				.select({ n: count() })
				.from(customer)
				.where(and(inTenant, gte(customer.createdAt, last30))),
			db
				.select({ n: count() })
				.from(customer)
				.where(
					and(
						inTenant,
						gte(customer.createdAt, prev30),
						lt(customer.createdAt, last30),
					),
				),
			db
				.select({ month, n: count() })
				.from(customer)
				.where(and(inTenant, gte(customer.createdAt, monthsStart)))
				.groupBy(month),
			db
				.select({ country: customer.country, n: count() })
				.from(customer)
				.where(and(inTenant, isNotNull(customer.country)))
				.groupBy(customer.country)
				.orderBy(desc(count()), customer.country),
			db
				.select({ n: count() })
				.from(project)
				.where(eq(project.organizationId, tenant)),
			db
				.select({ n: count() })
				.from(member)
				.where(eq(member.organizationId, tenant)),
			db
				.select({ n: count() })
				.from(invitation)
				.where(
					and(
						eq(invitation.organizationId, tenant),
						eq(invitation.status, "pending"),
						gte(invitation.expiresAt, now),
					),
				),
		]);

		const statusCounts = Object.fromEntries(
			CUSTOMER_STATUSES.map((s) => [
				s,
				byStatus.find((r) => r.status === s)?.n ?? 0,
			]),
		) as Record<CustomerStatus, number>;
		const total = byStatus.reduce((sum, r) => sum + r.n, 0);

		const monthlyCounts = new Map(monthly.map((r) => [r.month, r.n]));
		const top = countries.slice(0, TOP_COUNTRIES);
		const other = countries
			.slice(TOP_COUNTRIES)
			.reduce((sum, r) => sum + r.n, 0);

		return {
			customers: {
				total,
				byStatus: statusCounts,
				newLast30: newLast30.n,
				newPrev30: newPrev30.n,
				monthly: months.map((m) => ({
					month: m,
					count: monthlyCounts.get(m) ?? 0,
				})),
				topCountries: [
					...top.map((r) => ({ country: r.country ?? "", count: r.n })),
					...(other > 0 ? [{ country: "Other", count: other }] : []),
				],
			},
			projects: projects.n,
			members: members.n,
			pendingInvitations: pending.n,
		};
	});

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;
