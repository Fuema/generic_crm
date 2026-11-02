import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { STATUS_LABELS } from "#/components/Customers/CustomerStatusBadge";
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
import { CUSTOMER_STATUSES } from "#/lib/schema";

// Protected by the _authed layout guard; the stats are scoped to the active workspace
export const Route = createFileRoute("/_authed/dashboard")({
	loader: () => getDashboardStats(),
	component: DashboardPage,
});

// Categorical slots in fixed order: Lead, Active, Inactive
const STATUS_COLORS = {
	lead: "var(--viz-1)",
	active: "var(--viz-2)",
	inactive: "var(--viz-3)",
} as const;

function changeVsPrevious(current: number, previous: number): Delta {
	const period = "vs previous 30 days";
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
	const c = stats.customers;
	const active = c.byStatus.active;
	const activeRate = c.total > 0 ? Math.round((active / c.total) * 100) : 0;

	return (
		<div className="mx-auto max-w-7xl space-y-6 p-6">
			<div>
				<h1 className="text-2xl font-bold">Dashboard</h1>
				<p className="text-sm text-muted-foreground">
					{access?.workspace?.name ?? "Your workspace"} at a glance.
				</p>
			</div>

			{/* KPI row */}
			<section
				aria-label="Key figures"
				className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
			>
				<StatTile
					label="Customers"
					value={formatCount(c.total)}
					delta={{
						value: `+${c.newLast30}`,
						period: "in the last 30 days",
						direction: c.newLast30 > 0 ? "up" : "flat",
						good: true,
					}}
					trend={c.monthly.map((m) => m.count)}
				/>
				<StatTile
					label="New customers (30 days)"
					value={formatCount(c.newLast30)}
					delta={changeVsPrevious(c.newLast30, c.newPrev30)}
					caption={`${c.newPrev30} in the 30 days before`}
				/>
				<StatTile
					label="Active customers"
					value={`${activeRate}%`}
					caption={`${active} of ${c.total} are active`}
				>
					<Meter value={active} max={c.total} />
				</StatTile>
				<StatTile
					label="Team"
					value={`${stats.members} ${stats.members === 1 ? "member" : "members"}`}
					caption={`${stats.projects} ${stats.projects === 1 ? "project" : "projects"} · ${stats.pendingInvitations} pending ${stats.pendingInvitations === 1 ? "invitation" : "invitations"}`}
				/>
			</section>

			<ChartCard
				title="New customers per month"
				description="Last 12 months"
				table={{
					headers: ["Month", "New customers"],
					rows: c.monthly.map((m) => [m.month, String(m.count)]),
				}}
			>
				<MonthlyColumns data={c.monthly} />
			</ChartCard>

			<div className="grid gap-6 lg:grid-cols-2">
				<ChartCard
					title="Customers by status"
					description={`${c.total} customers`}
					table={{
						headers: ["Status", "Customers"],
						rows: CUSTOMER_STATUSES.map((s) => [
							STATUS_LABELS[s],
							String(c.byStatus[s]),
						]),
					}}
				>
					<StatusSegmentedBar
						label="Customers by status"
						segments={CUSTOMER_STATUSES.map((s) => ({
							name: STATUS_LABELS[s],
							value: c.byStatus[s],
							color: STATUS_COLORS[s],
						}))}
					/>
				</ChartCard>

				<ChartCard
					title="Top countries"
					description="Customers by country"
					table={{
						headers: ["Country", "Customers"],
						rows: c.topCountries.map((r) => [
							r.country === "Other" ? "Other" : countryName(r.country),
							String(r.count),
						]),
					}}
				>
					<RankedBars
						label="Customers by country"
						rows={c.topCountries.map((r) => ({
							name:
								r.country === "Other"
									? "Other countries"
									: countryName(r.country),
							value: r.count,
							folded: r.country === "Other",
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
						{user.emailVerified ? "Email verified" : "Email not verified"}
					</Badge>
					<Badge variant={user.twoFactorEnabled ? "default" : "secondary"}>
						{user.twoFactorEnabled ? "2FA on" : "2FA off"}
					</Badge>
					<Link
						to="/account/security"
						className={buttonVariants({
							variant: "outline",
							size: "sm",
							className: "ml-auto",
						})}
					>
						<ShieldCheck /> Security
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}
