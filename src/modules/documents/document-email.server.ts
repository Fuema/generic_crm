import { escapeHtml } from "#/lib/email";
import { formatMoney } from "#/lib/money";
import { m } from "#/paraglide/messages.js";

// Server-only. A sales document (invoice) as an email: the whole document in
// its own language, so the client can read it without an account. Every value
// is escaped before it goes into the HTML.

type Line = {
	description: string;
	sku: string | null;
	quantity: number;
	unitPriceCents: number;
	lineTotalCents: number;
};

export function documentEmail(input: {
	locale: string;
	title: string;
	subject: string;
	intro: string;
	workspaceName: string;
	// Lines after the totals: due date, how to pay…
	after: string[];
	closing: string;
	currency: string;
	taxRateBp: number;
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
	notes: string | null;
	lines: Line[];
}) {
	const locale = input.locale === "es" ? "es" : "en";
	const o = { locale } as const;
	const money = (cents: number) => formatMoney(cents, input.currency, locale);
	const cell =
		"padding:6px 8px;text-align:right;border-bottom:1px solid #e4e4e7";
	const rows = input.lines
		.map(
			(l) =>
				`<tr><td style="padding:6px 0;border-bottom:1px solid #e4e4e7">${escapeHtml(l.description)}${l.sku ? `<br><span style="font-size:12px;color:#71717a">${escapeHtml(l.sku)}</span>` : ""}</td><td style="${cell}">${l.quantity}</td><td style="${cell}">${escapeHtml(money(l.unitPriceCents))}</td><td style="${cell};padding-right:0">${escapeHtml(money(l.lineTotalCents))}</td></tr>`,
		)
		.join("");
	const total = (label: string, value: string, strong = false) =>
		`<tr><td colspan="3" style="padding:4px 8px;text-align:right;${strong ? "font-weight:700" : "color:#52525b"}">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right;${strong ? "font-weight:700" : ""}">${escapeHtml(value)}</td></tr>`;
	const head = (label: string, left = false) =>
		`<th style="padding:6px ${left ? "0" : "8px"};text-align:${left ? "left" : "right"};font-size:12px;color:#71717a;border-bottom:1px solid #e4e4e7">${escapeHtml(label)}</th>`;
	const taxLabel = m.quote_tax({ rate: (input.taxRateBp / 100).toString() }, o);
	const paragraph = (text: string) =>
		`<p style="color:#3f3f46;white-space:pre-wrap">${escapeHtml(text)}</p>`;
	const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f4f4f5;font-family:system-ui,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:640px;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 4px;font-size:20px;color:#18181b">${escapeHtml(input.title)}</h1>
<p style="margin:0 0 16px;color:#52525b">${escapeHtml(input.workspaceName)}</p>
${paragraph(input.intro)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;color:#18181b">
<tr>${head(m.quote_col_description({}, o), true)}${head(m.quote_col_quantity({}, o))}${head(m.quote_col_unit_price({}, o))}${head(m.quote_col_amount({}, o))}</tr>
${rows}
${total(m.quote_subtotal({}, o), money(input.subtotalCents))}
${total(taxLabel, money(input.taxCents))}
${total(m.quote_total({}, o), money(input.totalCents), true)}
</table>
${input.after.filter(Boolean).map(paragraph).join("")}
${input.notes ? paragraph(input.notes) : ""}
${paragraph(input.closing)}
</td></tr></table></td></tr></table></body></html>`;
	const text = [
		input.title,
		input.workspaceName,
		"",
		input.intro,
		"",
		...input.lines.map(
			(l) =>
				`${l.description}${l.sku ? ` (${l.sku})` : ""}: ${l.quantity} × ${money(l.unitPriceCents)} = ${money(l.lineTotalCents)}`,
		),
		"",
		`${m.quote_subtotal({}, o)}: ${money(input.subtotalCents)}`,
		`${taxLabel}: ${money(input.taxCents)}`,
		`${m.quote_total({}, o)}: ${money(input.totalCents)}`,
		...input.after.filter(Boolean),
		input.notes ?? "",
		"",
		input.closing,
	]
		.filter((line, i, all) => line !== "" || all[i - 1] !== "")
		.join("\n");
	return { subject: input.subject, html, text };
}
