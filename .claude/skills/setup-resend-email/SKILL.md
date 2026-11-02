---
name: setup-resend-email
description: Set up transactional email with Resend in any app (verification, password reset, sign-in codes, invitations, notifications). Use when the user asks to add or fix email sending, Resend, EMAIL_FROM or RESEND_API_KEY. Covers env vars, a server-only fetch module that also runs on Workers, a dev console fallback, a test script, bundle checks, domain verification (DKIM/SPF/DMARC) and production secrets.
---

Set up transactional email for this app with Resend (verification, password reset, sign-in codes, invitations, notifications).
Prefer the live Resend docs (https://resend.com/docs) over code you remember. Never print, log or commit the API key.

1. Preconditions.
   - Find the framework, the runtime (Node, Bun, Cloudflare Workers, Vercel Edge, …) and the package manager (from the lockfile).
   - Ask me for the app's display name, which will appear in the From line.
   - Check that I have a Resend account and an API key (https://resend.com/api-keys). Recommend a key with **Sending access** only, restricted to one domain once there is one. If there isn't a key yet, tell me to create one and stop until I say it's in the env file.

2. Inspect what's there before changing anything. Search for `resend`, `nodemailer`, `@sendgrid`, `postmark`, `mailgun`, `SMTP_`, `sendEmail`, `EMAIL_FROM` and the auth library's email hooks (Better Auth: `sendVerificationEmail`, `sendResetPassword`, `sendOTP`, `sendInvitationEmail`).
   - No email code → continue.
   - Resend already wired → skip to step 6 and verify it.
   - Another provider that works → stop and ask me whether to switch.
   - Managed auth that sends its own mail (Neon Auth, Clerk, Supabase Auth) → Resend is only needed for the app's other email, or as the custom SMTP that the auth provider requires in production. Ask me which.

3. Environment variables (names only; I paste the values).
   - `RESEND_API_KEY=re_...` — server only. Never prefix it with `VITE_`, `NEXT_PUBLIC_`, `PUBLIC_` or anything else the bundler exposes to the browser.
   - `EMAIL_FROM="App Name <onboarding@resend.dev>"` until a domain is verified (step 7), then `"App Name <no-reply@yourdomain.com>"`. Keep the quotes: the value has spaces and angle brackets.
   - Tell me which file to put them in (`.env.local` for Vite/Next/TanStack, `.dev.vars` for Wrangler-only Workers, `.env` otherwise). Don't edit `.env*` files yourself; add the names, without values, to `.env.example`.
   - Check that I saved them by reading **names and shape only**: the key exists, starts with `re_`, has no quotes or spaces; `EMAIL_FROM` uses an address on `resend.dev` or a domain I own. A placeholder like `auth@better-auth.com` from a library's docs will be rejected; flag it.
   - Restart the dev server after the values change.

4. Write one server-only email module (e.g. `src/lib/email.ts`, or `*.server.ts` where the framework uses that convention to keep code out of the client bundle).
   - Call `POST https://api.resend.com/emails` with `fetch` (`Authorization: Bearer <key>`, JSON body `{ from, to, subject, html, text }`). It runs unchanged on Workers and edge runtimes. Use the `resend` SDK only if the project already uses it or runs on Node only.
   - Always send a plain-text `text` part along with the `html`. Build the HTML with inline styles and table layout (email clients ignore most CSS), and HTML-escape every user-supplied value (names, workspace names, URLs).
   - Missing configuration: throw in production. In development, print the recipient, subject and text (links and codes included) to the server console so sign-up and reset still work locally.
   - Resend rejects the send (non-2xx): throw in production with the HTTP status only (the response body can echo the recipient). In development, print the email instead. The test sender returns 403 for anyone except the account owner.
   - Export one function per email (`sendVerificationEmail`, `sendResetPasswordEmail`, …), not a generic "send anything" helper reachable from the client.
   - If an email is triggered by a user action that can be retried, pass an `Idempotency-Key` header so a double click doesn't send two.

5. Connect it.
   - Auth library hooks (Better Auth: `emailVerification.sendVerificationEmail`, `emailAndPassword.sendResetPassword`, `twoFactor({ otpOptions: { sendOTP } })`, `organization({ sendInvitationEmail })`). Don't `await` slow sends inside a request where the library documents fire-and-forget; follow the library's guidance on timing attacks for reset and sign-up.
   - Rate-limit the endpoints that send email (sign-up, resend verification, forgot password, invite) so they can't be used to burn the quota or spam an address.
   - Add a test script, e.g. `"email:test": "<runner> scripts/send-test-email.ts"`, that takes a recipient, refuses to run without both variables, treats a rejection as a failure even in dev, and prints only "Sent" or the HTTP status.
   - If the project has a browser-bundle check, add a marker such as `"api.resend.com"` to it. Otherwise build and grep the client output for `api.resend.com` and for the key's value (without printing it).

6. Prove it works.
   - Run the project's validation/build scripts.
   - Run the test script to **my Resend account's email** (the test sender only delivers there). Ask me to confirm it arrived, and to check the spam folder: `resend.dev` mail often lands there.
   - Then test one real flow in the browser (forgot password is the quickest) and one to another address, which should fall back to the console in dev.
   - Each test uses quota: the free plan allows 100 emails a day and 3,000 a month. Check the current limits on the pricing page and tell me if a test plan would use a lot of them.

7. Production (tell me what to do; I own the DNS and the dashboard).
   - Add a domain in Resend (Domains → Add). Prefer a subdomain such as `mail.yourdomain.com` so the root domain's reputation is separate. Pick the region closest to the users.
   - Add the DNS records Resend shows (DKIM `TXT`, SPF `TXT` and the `MX` on the `send` subdomain). Add a DMARC record (`_dmarc` `TXT`, start with `v=DMARC1; p=none;`) if the domain has none. Wait for "Verified".
   - Switch `EMAIL_FROM` to an address on that domain; use a monitored `reply_to` if replies matter.
   - Set the production secrets in the host, not in files: `wrangler secret put RESEND_API_KEY` (Cloudflare), the Vercel/Netlify env settings, etc. `EMAIL_FROM` can be a plain variable.
   - Optional: a webhook (Resend → Webhooks) for bounces and complaints, so the app stops sending to bad addresses.
   - Re-run the test script against production and test one flow live.

8. Report:
   - what changed (files, scripts, packages, the names of the env vars only)
   - the command output and test results from step 6, and whether I confirmed delivery
   - anything not verified (e.g. delivery to other recipients before a domain is verified)
   - what's still needed for production from step 7
