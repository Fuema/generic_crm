---
name: setup-neon-auth
description: Set up login with Neon Auth (Managed Better Auth) in an app already linked to Neon. Use when the user asks to add authentication on Neon. Inspects existing identity first, checks required features against what Neon Auth supports (no MFA or passkeys: recommends self-managed Better Auth instead), enables it, wires the quickstart for the framework, protects routes and proves it end to end.
---

Set up login for this app with Neon Auth (Managed Better Auth).
Load the installed `neon` and `neon-auth` agent skills first. If they're missing, run `neon skills -s neon -y`. Prefer the live Neon docs linked below over code you remember.

1. Preconditions.
   - The `neon` CLI works. If it's missing, install it as in the `setup-neon-db` skill. If a command opens a browser sign-in, tell me to finish it there; if that fails, ask me to run `neon login`, then retry.
   - The app is already linked to a Neon project: `neon.ts` exists and `neon deploy` has run. If not, run the `setup-neon-db` skill first and stop here.
   - The project is in an AWS region and doesn't use IP Allow or Private Networking. Neon Auth can't be enabled otherwise. If either check fails, stop and tell me; don't remove those protections.

2. Inspect the existing identity before changing anything. Search for `better-auth`, `@neondatabase/auth`, Clerk, Auth.js, Supabase Auth and any `/api/auth` routes.
   - No auth → continue with Neon Auth.
   - Neon Auth already set up → skip to step 7 and verify it.
   - Self-hosted Better Auth or another working provider → stop and ask me whether to migrate. Explain that existing users, sessions and password hashes don't move automatically and that user IDs will change. Continue only if I say yes.

3. List the login features this app needs and check each against the plugin table in the `neon-auth` skill.
   - Neon Auth supports email/password, Google/GitHub/Vercel OAuth, email OTP, magic link, admin and JWT. Organization is partial (Beta).
   - Neon Auth doesn't support MFA, passkeys, API keys, generic OAuth, SSO/SAML or custom plugins. If one of these is required, stop and recommend self-managed Better Auth on Neon Postgres instead.

4. Enable Neon Auth.
   - Merge `auth: true` into the existing `defineConfig({...})` in `neon.ts`. Keep every other field.
   - Run `neon deploy`, then `neon neon-auth status`. Don't also run `neon neon-auth enable`; deploy already does it.
   - Deploy writes `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` into `.env.local` (or `.env` if it exists). For Vite/TanStack browser code, add `VITE_NEON_AUTH_URL` with the same Auth URL. Next.js also needs `NEON_AUTH_COOKIE_SECRET` (`openssl rand -base64 32`).
   - Don't edit other `.env*` entries, never print secret values, and never commit `.env*` files.

5. Implement login, following the quickstart that matches the framework:
   - TanStack Router / Start: https://neon.com/docs/auth/quick-start/tanstack-router.md
   - React / Vite (incl. React Router): https://neon.com/docs/auth/quick-start/react.md
   - Next.js: https://neon.com/docs/auth/quick-start/nextjs-api-only.md

   Rules:
   - Install `@neondatabase/auth`, plus `@neondatabase/auth-ui` if you use the pre-built UI. Use the project's package manager (detect it from the lockfile).
   - Use the `@neondatabase/auth` wrapper, not bare `better-auth/client`. Don't pass a `plugins` option; plugins are configured in Neon.
   - Results are `{ data, error }`. The user is `data.user`. Handle the error, loading, signed-in and signed-out states.
   - Pick one UI CSS import (`/css` or `/tailwind`), never both.
   - When migrating (step 2), remove the old auth server code only after the new flow works: its config, `/api/auth` handler, client and auth tables. Ask me before dropping tables.

6. Protect routes and data.
   - Redirect signed-out users away from protected pages. Keep the login, sign-up, recovery and auth routes and static assets reachable without a session.
   - Check the session on the server before reading protected data or running a mutation; return 401 without one. A valid session is not permission to read another user's rows.
   - Trusted domains: localhost is pre-approved. Add every production and preview origin with `neon neon-auth domain add https://<origin>` (scheme included, no trailing slash) before users reach it.

7. Prove it works.
   - The project's build script must pass. Then start the app and test it end to end in a browser:
     - sign up
     - sign in, including a wrong password
     - reload and keep the session
     - open a protected page signed out (redirected) and signed in (allowed)
     - send a direct unauthenticated request to a protected server endpoint (denied)
     - sign out
   - If email verification is on, test it with a code; shared SMTP doesn't send links.
   - Test social login only if it's configured.

8. Report:
   - what changed (files, packages, `neon.ts`, the names of the env vars only)
   - the command output and test results that prove step 7
   - any flow that couldn't be verified, and anything that failed
   - what's still needed for production: custom SMTP, your own OAuth apps for GitHub/Vercel and production Google, and the production domain added (https://neon.com/docs/auth/production-checklist.md)
