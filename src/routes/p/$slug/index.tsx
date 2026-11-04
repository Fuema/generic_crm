import {
	createFileRoute,
	Link,
	notFound,
	redirect,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { formatMoney, quoteNumberLabel } from "#/lib/money";
import { formatDay } from "#/modules/deals/components/DealBits";
import { invoiceLabel } from "#/modules/invoices/schema";
import { PortalShell } from "#/modules/portal/components/PortalBits";
import { getPortalHome } from "#/modules/portal/portal";
import {
	PROJECT_STATUS_LABELS,
	type ProjectStatus,
} from "#/modules/projects/schema";
import { m } from "#/paraglide/messages.js";

// Customer portal home (spec §8): the contact's open quotes, invoices to pay
// and active projects. Everything comes through getPortalHome, which reads
// the portal session and limits every query to the contact's scope.
export const Route = createFileRoute("/p/$slug/")({
	loader: async ({ params }) => {
		try {
			return await getPortalHome({ data: { slug: params.slug } });
		} catch (e) {
			if (e instanceof Response && e.status === 401)
				throw redirect({
					to: "/p/$slug/sign-in",
					params: { slug: params.slug },
				});
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	head: () => ({ meta: [{ title: m.portal_home_title() }] }),
	component: PortalHomePage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_portal_not_found()}
		</p>
	),
});

function Section({
	title,
	empty,
	children,
}: {
	title: string;
	empty: string;
	children: ReactNode[];
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{children.length ? (
					<ul className="divide-y">{children}</ul>
				) : (
					<p className="text-sm text-muted-foreground">{empty}</p>
				)}
			</CardContent>
		</Card>
	);
}

function PortalHomePage() {
	const { slug } = Route.useParams();
	const { portal, quotes, invoices, projects } = Route.useLoaderData();
	const name = [portal.firstName, portal.lastName].filter(Boolean).join(" ");
	return (
		<PortalShell
			slug={slug}
			workspaceName={portal.workspaceName}
			contactName={name}
		>
			<div>
				<h1 className="text-2xl font-bold">
					{m.portal_welcome({ name: portal.firstName })}
				</h1>
				<p className="text-sm text-muted-foreground">
					{portal.companyContact
						? m.portal_home_summary_company()
						: m.portal_home_summary()}
				</p>
			</div>
			<Section title={m.portal_open_quotes()} empty={m.portal_no_quotes()}>
				{quotes.map((q) => (
					<li key={q.id} className="flex flex-wrap items-center gap-2 py-2">
						<Link
							to="/p/$slug/quotes/$quoteId"
							params={{ slug, quoteId: q.id }}
							className="flex-1 font-medium hover:underline"
						>
							{quoteNumberLabel(q.number)}
						</Link>
						{q.validUntil ? (
							<span className="text-xs text-muted-foreground">
								{m.portal_valid_until({ date: formatDay(q.validUntil) })}
							</span>
						) : null}
						<span className="tabular-nums">
							{formatMoney(q.totalCents, q.currency)}
						</span>
					</li>
				))}
			</Section>
			<Section title={m.portal_open_invoices()} empty={m.portal_no_invoices()}>
				{invoices.map((i) => (
					<li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
						<span className="flex-1 font-medium">
							{invoiceLabel(i.year, i.number)}
						</span>
						{i.dueDate ? (
							<span className="text-xs text-muted-foreground">
								{m.portal_due({ date: formatDay(i.dueDate) })}
							</span>
						) : null}
						<span className="tabular-nums">
							{m.portal_balance({
								amount: formatMoney(i.totalCents - i.paidCents, i.currency),
							})}
						</span>
					</li>
				))}
			</Section>
			<Section title={m.portal_projects()} empty={m.portal_no_projects()}>
				{projects.map((p) => (
					<li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
						<span className="flex-1 font-medium">{p.name}</span>
						<span className="text-xs text-muted-foreground">
							{PROJECT_STATUS_LABELS[p.status as ProjectStatus]?.() ?? p.status}
						</span>
					</li>
				))}
			</Section>
		</PortalShell>
	);
}
