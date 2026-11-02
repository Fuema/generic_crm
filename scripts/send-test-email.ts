// Sends one test email through the app's email code (Resend).
//   bun run email:test you@example.com
// With Resend's test sender (onboarding@resend.dev), use your Resend account's email.
import { sendTestEmail } from "../src/lib/email";

const to = process.argv[2]?.trim();
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
	console.error("Usage: bun run email:test you@example.com");
	process.exit(1);
}
if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
	console.error("RESEND_API_KEY and EMAIL_FROM are not set in .env.local");
	process.exit(1);
}

// Treat a rejection as a failure here, even in development
process.env.NODE_ENV = "production";
try {
	await sendTestEmail(to);
	console.log(`Sent. Check the inbox of ${to} (and the spam folder).`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	console.error(
		"403 with onboarding@resend.dev means the recipient isn't your Resend account's email.",
	);
	process.exit(1);
}
