import { escapeHtml, sendEmail } from "#/lib/email";
import { formatMoney, quoteNumberLabel } from "#/lib/money";
import { m } from "#/paraglide/messages.js";

// Server-only. The quote email: the whole quote in the quote's language, so the
// client can read it without an account. Replies go to the member who sent it.
// Until the portal (phase 4), the client accepts by replying.

type Line = {
	description: string;
	sku: string | null;
	quantity: number;
	unitPriceCents: number;
	lineTotalCents: number;
};

export function quoteEmail(input: {
	senderName: string;
	workspaceName: string;
	contactName: string;
	quote: {
		number: number;
		locale: string;
		currency: string;
		subtotalCents: number;
		taxCents: number;
		totalCents: number;
		taxRateBp: number;
		validUntil: Date | null;
		notes: string | null;
	};
	lines: Line[];
}) {
	const q = input.quote;
	const locale = q.locale === "es" ? "es" : "en";
	const o = { locale } as const;
	const money = (cents: number) => formatMoney(cents, q.currency, locale);
	const number = quoteNumberLabel(q.number);
	const validUntil = q.validUntil
		? new Date(q.validUntil).toLocaleDateString(locale, { timeZone: "UTC" })
		: "";
	const subject = m.quote_email_subject(
		{ number, workspace: input.workspaceName },
		o,
	);
	const intro = m.quote_email_intro(
		{ name: input.contactName, workspace: input.workspaceName },
		o,
	);
	const rows = input.lines
		.map(
			(l) =>
				`<tr><td style="padding:6px 0;border-bottom:1px solid #e4e4e7">${escapeHtml(l.description)}${l.sku ? `<br><span style="font-size:12px;color:#71717a">${escapeHtml(l.sku)}</span>` : ""}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e4e4e7">${l.quantity}</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e4e4e7">${escapeHtml(money(l.unitPriceCents))}</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #e4e4e7">${escapeHtml(money(l.lineTotalCents))}</td></tr>`,
		)
		.join("");
	const total = (label: string, value: string, strong = false) =>
		`<tr><td colspan="3" style="padding:4px 8px;text-align:right;${strong ? "font-weight:700" : "color:#52525b"}">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right;${strong ? "font-weight:700" : ""}">${escapeHtml(value)}</td></tr>`;
	const head = (label: string, align = "right") =>
		`<th style="padding:6px ${align === "left" ? "0" : "8px"};text-align:${align};font-size:12px;color:#71717a;border-bottom:1px solid #e4e4e7">${escapeHtml(label)}</th>`;
	const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f4f4f5;font-family:system-ui,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:640px;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 4px;font-size:20px;color:#18181b">${escapeHtml(m.quote_doc_title({ number }, o))}</h1>
<p style="margin:0 0 16px;color:#52525b">${escapeHtml(input.workspaceName)}</p>
<p style="color:#3f3f46">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;color:#18181b">
<tr>${head(m.quote_col_description({}, o), "left")}${head(m.quote_col_quantity({}, o))}${head(m.quote_col_unit_price({}, o))}${head(m.quote_col_amount({}, o))}</tr>
${rows}
${total(m.quote_subtotal({}, o), money(q.subtotalCents))}
${total(m.quote_tax({ rate: (q.taxRateBp / 100).toString() }, o), money(q.taxCents))}
${total(m.quote_total({}, o), money(q.totalCents), true)}
</table>
${validUntil ? `<p style="color:#3f3f46">${escapeHtml(m.quote_valid_until_text({ date: validUntil }, o))}</p>` : ""}
${q.notes ? `<p style="color:#3f3f46;white-space:pre-wrap">${escapeHtml(q.notes)}</p>` : ""}
<p style="color:#3f3f46">${escapeHtml(m.quote_email_reply({ name: input.senderName }, o))}</p>
</td></tr></table></td></tr></table></body></html>`;
	const text = [
		m.quote_doc_title({ number }, o),
		input.workspaceName,
		"",
		intro,
		"",
		...input.lines.map(
			(l) =>
				`${l.description}${l.sku ? ` (${l.sku})` : ""}: ${l.quantity} × ${money(l.unitPriceCents)} = ${money(l.lineTotalCents)}`,
		),
		"",
		`${m.quote_subtotal({}, o)}: ${money(q.subtotalCents)}`,
		`${m.quote_tax({ rate: (q.taxRateBp / 100).toString() }, o)}: ${money(q.taxCents)}`,
		`${m.quote_total({}, o)}: ${money(q.totalCents)}`,
		validUntil ? m.quote_valid_until_text({ date: validUntil }, o) : "",
		q.notes ?? "",
		"",
		m.quote_email_reply({ name: input.senderName }, o),
	]
		.filter((line, i, all) => line !== "" || all[i - 1] !== "")
		.join("\n");
	return { subject, html, text };
}

export async function sendQuoteEmail(
	input: Parameters<typeof quoteEmail>[0] & { to: string; replyTo: string },
) {
	const { subject, html, text } = quoteEmail(input);
	await sendEmail({
		to: input.to,
		replyTo: input.replyTo,
		subject,
		html,
		text,
	});
}
