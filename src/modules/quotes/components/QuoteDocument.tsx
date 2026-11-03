import { formatMoney, quoteNumberLabel } from "#/lib/money";
import { m } from "#/paraglide/messages.js";
import type { QuoteDetail } from "../quotes";

// The quote as the client sees it, in the quote's own language whatever the
// reader's: what prints ("Print / Save as PDF") and what the email mirrors.
export function QuoteDocument({ detail }: { detail: QuoteDetail }) {
	const q = detail.quote;
	const locale = q.locale === "es" ? "es" : "en";
	const o = { locale } as const;
	const money = (cents: number) => formatMoney(cents, q.currency, locale);
	const day = (value: Date | string | null) =>
		value
			? new Date(value).toLocaleDateString(locale, { timeZone: "UTC" })
			: "";
	const number = quoteNumberLabel(q.number);
	const contactName = [detail.contactFirstName, detail.contactLastName]
		.filter(Boolean)
		.join(" ");

	return (
		<article
			lang={locale}
			className="space-y-8 rounded-lg border bg-card p-8 print:border-0 print:p-0"
		>
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-lg font-semibold">{detail.workspaceName}</p>
				</div>
				<div className="text-right">
					<h2 className="text-2xl font-bold">
						{m.quote_doc_title({ number }, o)}
					</h2>
					<p className="text-sm text-muted-foreground">
						{m.quote_doc_date({ date: day(q.sentAt ?? q.createdAt) }, o)}
					</p>
					{q.validUntil ? (
						<p className="text-sm text-muted-foreground">
							{m.quote_valid_until_text({ date: day(q.validUntil) }, o)}
						</p>
					) : null}
				</div>
			</header>

			<section>
				<p className="text-xs uppercase text-muted-foreground">
					{m.quote_doc_for({}, o)}
				</p>
				<p className="font-medium">{contactName}</p>
				{detail.companyName ? <p>{detail.companyName}</p> : null}
				{detail.contactEmail ? (
					<p className="text-sm text-muted-foreground">{detail.contactEmail}</p>
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
					{detail.lines.map((l) => (
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
					{!detail.lines.length ? (
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
							{money(q.subtotalCents)}
						</td>
					</tr>
					<tr>
						<td colSpan={3} className="text-right text-muted-foreground">
							{m.quote_tax({ rate: (q.taxRateBp / 100).toString() }, o)}
						</td>
						<td className="text-right tabular-nums">{money(q.taxCents)}</td>
					</tr>
					<tr className="text-base font-semibold">
						<td colSpan={3} className="pt-2 text-right">
							{m.quote_total({}, o)}
						</td>
						<td className="pt-2 text-right tabular-nums">
							{money(q.totalCents)}
						</td>
					</tr>
				</tfoot>
			</table>

			{q.notes ? (
				<section>
					<p className="text-xs uppercase text-muted-foreground">
						{m.quote_notes({}, o)}
					</p>
					<p className="whitespace-pre-wrap text-sm">{q.notes}</p>
				</section>
			) : null}
		</article>
	);
}
