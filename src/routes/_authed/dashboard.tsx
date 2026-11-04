import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { ChartCard } from "#/components/Dashboard/ChartCard";
import { MonthlyColumns } from "#/components/Dashboard/MonthlyColumns";
import { RankedBars } from "#/components/Dashboard/RankedBars";
import {
	type Delta,
	formatCount,
	Meter,
	StatTile,
} from "#/components/Dashboard/StatTile";
import { StatusSegmentedBar } from "#/components/Dashboard/StatusSegmentedBar";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { RoleBadge } from "#/components/Workspace/RoleBadge";
import { countryName } from "#/lib/countries";
import { getDashboardStats } from "#/lib/dashboard";
import { LIFECYCLE_STAGES, STAGE_LABELS } from "#/modules/contacts/schema";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed layout guard; the stats are scoped to the active workspace
export const Route = createFileRoute("/_authed/dashboard")({
	loader: () => getDashboardStats(),
	component: DashboardPage,
});

// Categorical slots in fixed order; the two quiet stages share the muted tone
const STAGE_COLORS = {
	subscriber: "var(--viz-deemph)",
	lead: "var(--viz-1)",
	qualified: "var(--viz-2)",
	customer: "var(--viz-3)",
	inactive: "var(--viz-axis)",
} as const;

function changeVsPrevious(current: number, previous: number): Delta {
	const period = m.dashboard_vs_previous();
	if (previous === 0) {
		return current === 0
			? { value: "0", period, direction: "flat", good: true }
			: { value: `+${current}`, period, direction: "up", good: true };
	}
	const pct = Math.round(((current - previous) / previous) * 100);
	return {
		value: `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`,
		period,
		direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
		good: pct >= 0,
	};
}

function DashboardPage() {
	const stats = Route.useLoaderData();
	const { session, access } = Route.useRouteContext();
	const { user } = session;
	const c = stats.contacts;
	const customers = c.byStage.customer;
	const customerRate =
		c.total > 0 ? Math.round((customers / c.total) * 100) : 0;
	const country = (code: string) =>
		code ? countryName(code) : m.dashboard_other_countries();

	return (
		<div className="mx-auto max-w-7xl space-y-6 p-6">
			<div>
				<h1 className="text-2xl font-bold">{m.nav_dashboard()}</h1>
				<p className="text-sm text-muted-foreground">
					{m.dashboard_summary({
						name: access?.workspace?.name ?? m.dashboard_your_workspace(),
					})}
				</p>
			</div>

			{/* KPI row */}
			<section
				aria-label={m.dashboard_key_figures()}
				className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
			>
				<StatTile
					label={m.nav_contacts()}
					value={formatCount(c.total)}
					delta={{
						value: `+${c.newLast30}`,
						period: m.dashboard_in_last_30(),
						direction: c.newLast30 > 0 ? "up" : "flat",
						good: true,
					}}
					trend={c.monthly.map((x) => x.count)}
				/>
				<StatTile
					label={m.dashboard_new_contacts_30()}
					value={formatCount(c.newLast30)}
					delta={changeVsPrevious(c.newLast30, c.newPrev30)}
					caption={m.dashboard_in_30_before({ count: c.newPrev30 })}
				/>
				<StatTile
					label={m.dashboard_customers_share()}
					value={`${customerRate}%`}
					caption={m.dashboard_customers_of({
						count: customers,
						total: c.total,
					})}
				>
					<Meter value={customers} max={c.total} />
				</StatTile>
				<StatTile
					label={m.dashboard_team()}
					value={m.dashboard_members({ count: stats.members })}
					caption={m.dashboard_team_caption({
						projects: stats.projects,
						invitations: stats.pendingInvitations,
					})}
				/>
			</section>

			<ChartCard
				title={m.dashboard_new_per_month()}
				description={m.dashboard_last_12_months()}
				table={{
					headers: [m.dashboard_month(), m.dashboard_new_contacts()],
					rows: c.monthly.map((x) => [x.month, String(x.count)]),
				}}
			>
				<MonthlyColumns
					data={c.monthly}
					label={m.dashboard_new_per_month()}
					itemLabel={(month, count) => m.dashboard_month_new({ month, count })}
				/>
			</ChartCard>

			<div className="grid gap-6 lg:grid-cols-2">
				<ChartCard
					title={m.dashboard_by_stage()}
					description={m.dashboard_contacts_count({ count: c.total })}
					table={{
						headers: [m.contact_stage(), m.nav_contacts()],
						rows: LIFECYCLE_STAGES.map((s) => [
							STAGE_LABELS[s](),
							String(c.byStage[s]),
						]),
					}}
				>
					<StatusSegmentedBar
						label={m.dashboard_by_stage()}
						segments={LIFECYCLE_STAGES.map((s) => ({
							name: STAGE_LABELS[s](),
							value: c.byStage[s],
							color: STAGE_COLORS[s],
						}))}
					/>
				</ChartCard>

				<ChartCard
					title={m.dashboard_top_countries()}
					description={m.dashboard_companies_by_country()}
					table={{
						headers: [m.common_country(), m.nav_companies()],
						rows: stats.topCountries.map((r) => [
							country(r.country),
							String(r.count),
						]),
					}}
				>
					<RankedBars
						label={m.dashboard_companies_by_country()}
						rows={stats.topCountries.map((r) => ({
							name: country(r.country),
							value: r.count,
							folded: r.country === "",
						}))}
					/>
				</ChartCard>
			</div>

			{/* Account summary */}
			<Card className="py-4">
				<CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
					<span className="font-medium">{user.name}</span>
					<span className="break-all text-muted-foreground">{user.email}</span>
					{access ? <RoleBadge role={access.role} /> : null}
					<Badge variant={user.emailVerified ? "default" : "secondary"}>
						{user.emailVerified
							? m.dashboard_email_verified()
							: m.dashboard_email_not_verified()}
					</Badge>
					<Badge variant={user.twoFactorEnabled ? "default" : "secondary"}>
						{user.twoFactorEnabled
							? m.dashboard_2fa_on()
							: m.dashboard_2fa_off()}
					</Badge>
					<Link
						to="/account/security"
						className={buttonVariants({
							variant: "outline",
							size: "sm",
							className: "ml-auto",
						})}
					>
						<ShieldCheck /> {m.nav_security()}
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}
