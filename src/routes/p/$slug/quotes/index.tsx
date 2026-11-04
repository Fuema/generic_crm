import {
	createFileRoute,
	Link,
	notFound,
	redirect,
} from "@tanstack/react-router";
import { Card, CardContent } from "#/components/ui/card";
import { formatMoney, quoteNumberLabel } from "#/lib/money";
import { formatDay } from "#/modules/deals/components/DealBits";
import { PortalShell } from "#/modules/portal/components/PortalBits";
import { getPortalQuotes } from "#/modules/portal/portal";
import { QuoteStatusBadge } from "#/modules/quotes/components/QuoteStatusBadge";
import { m } from "#/paraglide/messages.js";

// The contact's quotes in the portal: sent, accepted and declined ones (spec §8)
export const Route = createFileRoute("/p/$slug/quotes/")({
	loader: async ({ params }) => {
		try {
			return await getPortalQuotes({ data: { slug: params.slug } });
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
	head: () => ({ meta: [{ title: m.portal_quotes_title() }] }),
	component: PortalQuotesPage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_portal_not_found()}
		</p>
	),
});

function PortalQuotesPage() {
	const { slug } = Route.useParams();
	const { portal, quotes } = Route.useLoaderData();
	const name = [portal.firstName, portal.lastName].filter(Boolean).join(" ");
	return (
		<PortalShell
			slug={slug}
			workspaceName={portal.workspaceName}
			contactName={name}
		>
			<h1 className="text-2xl font-bold">{m.portal_quotes_title()}</h1>
			<Card>
				<CardContent>
					{quotes.length ? (
						<ul className="divide-y">
							{quotes.map((q) => (
								<li
									key={q.id}
									className="flex flex-wrap items-center gap-3 py-3"
								>
									<Link
										to="/p/$slug/quotes/$quoteId"
										params={{ slug, quoteId: q.id }}
										className="flex-1 font-medium hover:underline"
									>
										{quoteNumberLabel(q.number)}
									</Link>
									{q.sentAt ? (
										<span className="text-xs text-muted-foreground">
											{formatDay(q.sentAt)}
										</span>
									) : null}
									<QuoteStatusBadge status={q.displayStatus} />
									<span className="tabular-nums">
										{formatMoney(q.totalCents, q.currency)}
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">
							{m.portal_no_quotes_at_all()}
						</p>
					)}
				</CardContent>
			</Card>
		</PortalShell>
	);
}
