import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { formatMoney, quoteNumberLabel } from "#/lib/money";
import { m } from "#/paraglide/messages.js";
import { createQuote, type QuoteRow } from "../quotes";
import { QuoteStatusBadge } from "./QuoteStatusBadge";

// The quotes of a contact or deal on its record page, with "New quote", which
// creates a draft for it and opens it
export function RelatedQuotes({
	quotes,
	from,
	canCreate,
}: {
	quotes: QuoteRow[];
	from: { contactId: string } | { dealId: string } | null;
	canCreate: boolean;
}) {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
				<CardTitle>{m.quotes_title()}</CardTitle>
				{canCreate && from ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={busy}
						onClick={async () => {
							setError(null);
							setBusy(true);
							try {
								const { id } = await createQuote({ data: from });
								void navigate({
									to: "/quotes/$quoteId",
									params: { quoteId: id },
								});
							} catch (e) {
								setError(await serverErrorMessage(e));
								setBusy(false);
							}
						}}
					>
						<Plus /> {m.quotes_new()}
					</Button>
				) : null}
			</CardHeader>
			<CardContent className="space-y-2">
				<FormAlert message={error} />
				{quotes.length ? (
					<ul className="divide-y">
						{quotes.map((q) => (
							<li key={q.id} className="flex flex-wrap items-center gap-2 py-2">
								<Link
									to="/quotes/$quoteId"
									params={{ quoteId: q.id }}
									className="min-w-0 flex-1 font-medium hover:underline"
								>
									{quoteNumberLabel(q.number)}
								</Link>
								<span className="text-sm tabular-nums">
									{formatMoney(q.totalCents, q.currency)}
								</span>
								<QuoteStatusBadge status={q.displayStatus} />
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">
						{m.quotes_none_here()}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
