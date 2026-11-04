import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { formatMoney } from "#/lib/money";

// A status as a word (never color only), with a tone
export function DocumentStatusBadge({
	label,
	tone,
}: {
	label: string;
	tone: "neutral" | "active" | "good" | "bad";
}) {
	const variant =
		tone === "good"
			? "default"
			: tone === "bad"
				? "destructive"
				: tone === "active"
					? "outline"
					: "secondary";
	return <Badge variant={variant}>{label}</Badge>;
}

type Row = {
	id: string;
	label: string;
	totalCents: number;
	currency: string;
	status: { label: string; tone: "neutral" | "active" | "good" | "bad" };
};

// Orders or invoices on a contact's, deal's or quote's page, with an optional
// "New …" button that creates a draft and opens it
export function RelatedDocuments({
	title,
	empty,
	newLabel,
	rows,
	to,
	onCreate,
}: {
	title: string;
	empty: string;
	newLabel?: string;
	rows: Row[];
	to: "/orders/$orderId" | "/invoices/$invoiceId";
	onCreate?: () => Promise<void>;
}) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
				<CardTitle>{title}</CardTitle>
				{onCreate && newLabel ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={busy}
						onClick={async () => {
							setError(null);
							setBusy(true);
							try {
								await onCreate();
							} catch (e) {
								setError(await serverErrorMessage(e));
								setBusy(false);
							}
						}}
					>
						<Plus /> {newLabel}
					</Button>
				) : null}
			</CardHeader>
			<CardContent className="space-y-2">
				<FormAlert message={error} />
				{rows.length ? (
					<ul className="divide-y">
						{rows.map((r) => (
							<li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
								{to === "/orders/$orderId" ? (
									<Link
										to="/orders/$orderId"
										params={{ orderId: r.id }}
										className="min-w-0 flex-1 font-medium hover:underline"
									>
										{r.label}
									</Link>
								) : (
									<Link
										to="/invoices/$invoiceId"
										params={{ invoiceId: r.id }}
										className="min-w-0 flex-1 font-medium hover:underline"
									>
										{r.label}
									</Link>
								)}
								<span className="text-sm tabular-nums">
									{formatMoney(r.totalCents, r.currency)}
								</span>
								<DocumentStatusBadge {...r.status} />
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">{empty}</p>
				)}
			</CardContent>
		</Card>
	);
}
