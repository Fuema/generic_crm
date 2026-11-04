import { formatMoney } from "#/lib/money";
import { m } from "#/paraglide/messages.js";
import type { DocumentLine } from "../lines";

// A sales document (order, invoice) as the client sees it, in the document's
// own language whatever the reader's: what prints ("Print / Save as PDF").
export function DocumentView({
	locale: rawLocale,
	title,
	workspaceName,
	meta,
	party,
	lines,
	currency,
	taxRateBp,
	subtotalCents,
	taxCents,
	totalCents,
	notes,
}: {
	locale: string;
	title: string;
	workspaceName: string;
	// Lines under the title: dates, due date, reference…
	meta: string[];
	party: { name: string; company: string | null; email: string | null };
	lines: DocumentLine[];
	currency: string;
	taxRateBp: number;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
	notes: string | null;
}) {
	const locale = rawLocale === "es" ? "es" : "en";
	const o = { locale } as const;
	const money = (cents: number) => formatMoney(cents, currency, locale);

	return (
		<article
			lang={locale}
			className="space-y-8 rounded-lg border bg-card p-8 print:border-0 print:p-0"
		>
			<header className="flex flex-wrap items-start justify-between gap-4">
				<p className="text-lg font-semibold">{workspaceName}</p>
				<div className="text-right">
					<h2 className="text-2xl font-bold">{title}</h2>
					{meta.filter(Boolean).map((line) => (
						<p key={line} className="text-sm text-muted-foreground">
							{line}
						</p>
					))}
				</div>
			</header>

			<section>
				<p className="text-xs uppercase text-muted-foreground">
					{m.quote_doc_for({}, o)}
				</p>
				<p className="font-medium">{party.name}</p>
				{party.company ? <p>{party.company}</p> : null}
				{party.email ? (
					<p className="text-sm text-muted-foreground">{party.email}</p>
				) : null}
			</section>

			<table className="w-full text-sm">
				<thead>
					<tr className="border-b text-left text-xs text-muted-foreground">
						<th scope="col" className="py-2 font-medium">
							{m.quote_col_description({}, o)}
						</th>
						<th scope="col" className="py-2 text-right font-medium">
							{m.quote_col_quantity({}, o)}
						</th>
						<th scope="col" className="py-2 text-right font-medium">
							{m.quote_col_unit_price({}, o)}
						</th>
						<th scope="col" className="py-2 text-right font-medium">
							{m.quote_col_amount({}, o)}
						</th>
					</tr>
				</thead>
				<tbody>
					{lines.map((l) => (
						<tr key={l.id} className="border-b align-top">
							<td className="py-2">
								<span className="whitespace-pre-wrap">{l.description}</span>
								{l.sku ? (
									<span className="block text-xs text-muted-foreground">
										{l.sku}
									</span>
								) : null}
							</td>
							<td className="py-2 text-right tabular-nums">{l.quantity}</td>
							<td className="py-2 text-right tabular-nums">
								{money(l.unitPriceCents)}
							</td>
							<td className="py-2 text-right tabular-nums">
								{money(l.lineTotalCents)}
							</td>
						</tr>
					))}
					{!lines.length ? (
						<tr>
							<td
								colSpan={4}
								className="py-6 text-center text-muted-foreground"
							>
								{m.quote_no_lines({}, o)}
							</td>
						</tr>
					) : null}
				</tbody>
				<tfoot>
					<tr>
						<td colSpan={3} className="pt-3 text-right text-muted-foreground">
							{m.quote_subtotal({}, o)}
						</td>
						<td className="pt-3 text-right tabular-nums">
							{money(subtotalCents)}
						</td>
					</tr>
					<tr>
						<td colSpan={3} className="text-right text-muted-foreground">
							{m.quote_tax({ rate: (taxRateBp / 100).toString() }, o)}
						</td>
						<td className="text-right tabular-nums">{money(taxCents)}</td>
					</tr>
					<tr className="text-base font-semibold">
						<td colSpan={3} className="pt-2 text-right">
							{m.quote_total({}, o)}
						</td>
						<td className="pt-2 text-right tabular-nums">
							{money(totalCents)}
						</td>
					</tr>
				</tfoot>
			</table>

			{notes ? (
				<section>
					<p className="text-xs uppercase text-muted-foreground">
						{m.quote_notes({}, o)}
					</p>
					<p className="whitespace-pre-wrap text-sm">{notes}</p>
				</section>
			) : null}
		</article>
	);
}
