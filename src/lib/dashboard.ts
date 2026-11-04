import { createServerFn } from "@tanstack/react-start";
import {
	and,
	count,
	desc,
	eq,
	gte,
	isNotNull,
	isNull,
	lt,
	ne,
	sql,
} from "drizzle-orm";
import { db } from "#/db/index";
import { company, contact, invitation, member, project } from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import {
	LIFECYCLE_STAGES,
	type LifecycleStage,
} from "#/modules/contacts/schema";

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

// KPIs for the active workspace: active contacts by lifecycle stage, new
// contacts, companies by country, the team. Every query is scoped to the
// workspace from the session; viewers can see it (read permissions only).
export const getDashboardStats = createServerFn({ method: "GET" })
	.middleware([
		requirePermission({
			contact: ["read"],
			company: ["read"],
			project: ["read"],
		}),
	])
	.handler(async ({ context }) => {
		const workspace = context.workspaceId;
		const now = new Date();
		const last30 = new Date(now.getTime() - 30 * DAY);
		const prev30 = new Date(now.getTime() - 60 * DAY);
		const months = lastTwelveMonths(now);
		const monthsStart = new Date(`${months[0]}-01T00:00:00Z`);
		const active = and(
			eq(contact.workspaceId, workspace),
			isNull(contact.archivedAt),
		);
		const month = sql<string>`to_char(date_trunc('month', ${contact.createdAt}), 'YYYY-MM')`;

		const [
			byStage,
			[newLast30],
			[newPrev30],
			monthly,
			countries,
			[projects],
			[members],
			[pending],
		] = await Promise.all([
			db
				.select({ stage: contact.lifecycleStage, n: count() })
				.from(contact)
				.where(active)
				.groupBy(contact.lifecycleStage),
			db
				.select({ n: count() })
				.from(contact)
				.where(and(active, gte(contact.createdAt, last30))),
			db
				.select({ n: count() })
				.from(contact)
				.where(
					and(
						active,
						gte(contact.createdAt, prev30),
						lt(contact.createdAt, last30),
					),
				),
			db
				.select({ month, n: count() })
				.from(contact)
				.where(and(active, gte(contact.createdAt, monthsStart)))
				.groupBy(month),
			db
				.select({ country: company.country, n: count() })
				.from(company)
				.where(
					and(
						eq(company.workspaceId, workspace),
						isNull(company.archivedAt),
						isNotNull(company.country),
						ne(company.country, ""),
					),
				)
				.groupBy(company.country)
				.orderBy(desc(count()), company.country),
			db
				.select({ n: count() })
				.from(project)
				.where(
					and(eq(project.workspaceId, workspace), isNull(project.archivedAt)),
				),
			db
				.select({ n: count() })
				.from(member)
				.where(eq(member.organizationId, workspace)),
			db
				.select({ n: count() })
				.from(invitation)
				.where(
					and(
						eq(invitation.organizationId, workspace),
						eq(invitation.status, "pending"),
						gte(invitation.expiresAt, now),
					),
				),
		]);

		const stageCounts = Object.fromEntries(
			LIFECYCLE_STAGES.map((s) => [
				s,
				byStage.find((r) => r.stage === s)?.n ?? 0,
			]),
		) as Record<LifecycleStage, number>;
		const total = byStage.reduce((sum, r) => sum + r.n, 0);

		const monthlyCounts = new Map(monthly.map((r) => [r.month, r.n]));
		const top = countries.slice(0, TOP_COUNTRIES);
		const other = countries
			.slice(TOP_COUNTRIES)
			.reduce((sum, r) => sum + r.n, 0);

		return {
			contacts: {
				total,
				byStage: stageCounts,
				newLast30: newLast30.n,
				newPrev30: newPrev30.n,
				monthly: months.map((mo) => ({
					month: mo,
					count: monthlyCounts.get(mo) ?? 0,
				})),
			},
			// "" stands for the other countries, folded together
			topCountries: [
				...top.map((r) => ({ country: r.country ?? "", count: r.n })),
				...(other > 0 ? [{ country: "", count: other }] : []),
			],
			projects: projects.n,
			members: members.n,
			pendingInvitations: pending.n,
		};
	});

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;
