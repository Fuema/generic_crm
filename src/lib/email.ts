// Sends transactional auth emails through Resend's HTTP API.
// Uses fetch instead of the SDK so it runs unchanged on Cloudflare Workers.
// Emails are written in the language of the request that triggers them: the
// recipient's own for verification, reset and sign-in codes; the inviter's for
// invitations (members' saved language preference arrives in phase 1, spec §14).
import { ROLE_LABELS, type WorkspaceRole } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";
import { baseLocale, getLocale } from "#/paraglide/runtime.js";

// The product name is the same in every language; one source for UI and emails
export const APP_NAME = m.app_name({}, { locale: baseLocale });

type Email = {
	to: string;
	subject: string;
	html: string;
	text: string;
	// Where replies go (e.g. the member who sent a quote)
	replyTo?: string;
};

export function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export async function sendEmail({ to, subject, html, text, replyTo }: Email) {
	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;

	const isProduction = process.env.NODE_ENV === "production";
	// Development fallback: print the email so links and codes can still be used
	const printToConsole = (reason: string) =>
		console.info(
			`[email:dev] ${reason}\n[email:dev] to=${to} subject="${subject}"\n${text}`,
		);

	if (!apiKey || !from) {
		if (isProduction) {
			throw new Error(
				"RESEND_API_KEY and EMAIL_FROM must be set in production",
			);
		}
		printToConsole("Resend not configured, printing instead");
		return;
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to,
			// A subject is one line, whatever names went into it
			subject: subject.replace(/[\r\n]+/g, " "),
			html,
			text,
			...(replyTo ? { reply_to: replyTo } : {}),
		}),
	});

	if (!response.ok) {
		// Resend's test sender (onboarding@resend.dev) only delivers to the account
		// owner and rejects other recipients with 403. In development, keep test
		// accounts usable by printing the email instead of failing the request.
		if (!isProduction) {
			printToConsole(
				`Resend rejected the email (HTTP ${response.status}), printing instead`,
			);
			return;
		}
		// Don't log the body: it can echo the recipient address
		throw new Error(`Resend rejected the email (HTTP ${response.status})`);
	}
}

function layout(title: string, body: string) {
	return `<!doctype html><html lang="${getLocale()}"><body style="margin:0;background:#f4f4f5;font-family:system-ui,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:12px;padding:32px">
<tr><td><h1 style="margin:0 0 16px;font-size:20px;color:#18181b">${title}</h1>${body}
<p style="margin:24px 0 0;font-size:12px;color:#71717a">${escapeHtml(m.email_ignore())}</p>
</td></tr></table></td></tr></table></body></html>`;
}

function paragraph(text: string) {
	return `<p style="color:#3f3f46">${text}</p>`;
}

function button(url: string, label: string) {
	return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#18181b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>
<p style="font-size:12px;color:#71717a;word-break:break-all">${escapeHtml(m.email_paste_link())}<br>${escapeHtml(url)}</p>`;
}

function roleLabel(role: string) {
	return role in ROLE_LABELS
		? ROLE_LABELS[role as WorkspaceRole].label().toLowerCase()
		: role;
}

export function sendVerificationEmail(to: string, name: string, url: string) {
	return sendEmail({
		to,
		subject: m.email_verify_subject({ app: APP_NAME }),
		html: layout(
			escapeHtml(m.email_verify_title()),
			paragraph(escapeHtml(m.email_verify_body({ name }))) +
				button(url, m.email_verify_button()),
		),
		text: m.email_verify_text({ name, app: APP_NAME, url }),
	});
}

export function sendResetPasswordEmail(to: string, name: string, url: string) {
	return sendEmail({
		to,
		subject: m.email_reset_subject({ app: APP_NAME }),
		html: layout(
			escapeHtml(m.email_reset_title()),
			paragraph(escapeHtml(m.email_reset_body({ name }))) +
				button(url, m.email_reset_button()),
		),
		text: m.email_reset_text({ name, app: APP_NAME, url }),
	});
}

export function sendTwoFactorCodeEmail(to: string, name: string, otp: string) {
	return sendEmail({
		to,
		subject: m.email_2fa_subject({ otp, app: APP_NAME }),
		html: layout(
			escapeHtml(m.email_2fa_title()),
			`${paragraph(escapeHtml(m.email_2fa_body({ name })))}
<p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:8px;color:#18181b">${escapeHtml(otp)}</p>`,
		),
		text: m.email_2fa_text({ name, app: APP_NAME, otp }),
	});
}

export function sendInvitationEmail(
	to: string,
	inviterName: string,
	workspaceName: string,
	role: string,
	url: string,
) {
	const roleName = roleLabel(role);
	return sendEmail({
		to,
		subject: m.email_invite_subject({
			inviter: inviterName,
			workspace: workspaceName,
			app: APP_NAME,
		}),
		html: layout(
			escapeHtml(m.email_invite_title({ workspace: workspaceName })),
			// Each value is escaped before it is wrapped in markup. This message is the
			// only one inserted as HTML: keep email_invite_body plain text (no &, < or tags)
			paragraph(
				m.email_invite_body({
					inviter: escapeHtml(inviterName),
					workspace: `<strong>${escapeHtml(workspaceName)}</strong>`,
					role: `<strong>${escapeHtml(roleName)}</strong>`,
				}),
			) + button(url, m.email_invite_button()),
		),
		text: m.email_invite_text({
			inviter: inviterName,
			workspace: workspaceName,
			app: APP_NAME,
			role: roleName,
			url,
		}),
	});
}

// Used by `bun run email:test` to confirm the Resend setup end to end
export function sendTestEmail(to: string) {
	return sendEmail({
		to,
		subject: m.email_test_subject({ app: APP_NAME }),
		html: layout(
			escapeHtml(m.email_test_title()),
			paragraph(escapeHtml(m.email_test_body({ app: APP_NAME }))),
		),
		text: m.email_test_text({ app: APP_NAME }),
	});
}
