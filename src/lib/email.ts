// Sends transactional auth emails through Resend's HTTP API.
// Uses fetch instead of the SDK so it runs unchanged on Cloudflare Workers.

const APP_NAME = "My TanStack App";

type Email = { to: string; subject: string; html: string; text: string };

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

async function sendEmail({ to, subject, html, text }: Email) {
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
		body: JSON.stringify({ from, to, subject, html, text }),
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
	return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:system-ui,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:12px;padding:32px">
<tr><td><h1 style="margin:0 0 16px;font-size:20px;color:#18181b">${title}</h1>${body}
<p style="margin:24px 0 0;font-size:12px;color:#71717a">If you didn't request this, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

function button(url: string, label: string) {
	return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#18181b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></p>
<p style="font-size:12px;color:#71717a;word-break:break-all">Or paste this link into your browser:<br>${escapeHtml(url)}</p>`;
}

export function sendVerificationEmail(to: string, name: string, url: string) {
	return sendEmail({
		to,
		subject: `Verify your email for ${APP_NAME}`,
		html: layout(
			"Confirm your email",
			`<p style="color:#3f3f46">Hi ${escapeHtml(name)}, confirm this address to finish creating your account. The link expires in 1 hour.</p>${button(url, "Verify email")}`,
		),
		text: `Hi ${name}, confirm your email for ${APP_NAME}: ${url}\nThe link expires in 1 hour.`,
	});
}

export function sendResetPasswordEmail(to: string, name: string, url: string) {
	return sendEmail({
		to,
		subject: `Reset your ${APP_NAME} password`,
		html: layout(
			"Reset your password",
			`<p style="color:#3f3f46">Hi ${escapeHtml(name)}, use the button below to choose a new password. The link expires in 1 hour, and every device will be signed out.</p>${button(url, "Reset password")}`,
		),
		text: `Hi ${name}, reset your ${APP_NAME} password: ${url}\nThe link expires in 1 hour.`,
	});
}

export function sendTwoFactorCodeEmail(to: string, name: string, otp: string) {
	return sendEmail({
		to,
		subject: `${otp} is your ${APP_NAME} sign-in code`,
		html: layout(
			"Your sign-in code",
			`<p style="color:#3f3f46">Hi ${escapeHtml(name)}, enter this code to finish signing in. It expires in 3 minutes.</p>
<p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:8px;color:#18181b">${escapeHtml(otp)}</p>`,
		),
		text: `Hi ${name}, your ${APP_NAME} sign-in code is ${otp}. It expires in 3 minutes.`,
	});
}

export function sendInvitationEmail(
	to: string,
	inviterName: string,
	workspaceName: string,
	role: string,
	url: string,
) {
	return sendEmail({
		to,
		subject: `${inviterName} invited you to ${workspaceName} on ${APP_NAME}`,
		html: layout(
			`Join ${escapeHtml(workspaceName)}`,
			`<p style="color:#3f3f46">${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(workspaceName)}</strong> as <strong>${escapeHtml(role)}</strong>. The invitation expires in 48 hours.</p>${button(url, "Accept invitation")}`,
		),
		text: `${inviterName} invited you to join ${workspaceName} on ${APP_NAME} as ${role}: ${url}\nThe invitation expires in 48 hours.`,
	});
}

// Used by `bun run email:test` to confirm the Resend setup end to end
export function sendTestEmail(to: string) {
	return sendEmail({
		to,
		subject: `Test email from ${APP_NAME}`,
		html: layout(
			"Email is working",
			`<p style="color:#3f3f46">If you can read this, ${APP_NAME} can send verification, password-reset, sign-in code and invitation emails.</p>`,
		),
		text: `Email is working: ${APP_NAME} can send verification, password-reset, sign-in code and invitation emails.`,
	});
}
