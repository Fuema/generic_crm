# CLAUDE.md

Generic CRM: a multi-tenant CRM for small businesses on TanStack Start +
Cloudflare Workers + Neon Postgres + Better Auth. **Read `specification.md`
first**: vision, decisions, data model, customization engine, portal, phases,
conventions and pitfalls live there.

## Where things stand
- **Phase 1 in progress** (spec §16; phase 0 done). Steps 1–5 and 6a (CSV import/export,
  #18) are merged; 6b (merging duplicate contacts, spec §10) is built and waits on the
  owner's browser check. **Next is the final check of phase 1's acceptance criteria**, then
  the owner decides on phase 2. Spec §16.1 is the handoff: what waits on the owner, how to resume.
- Modules that point to contacts (deals, invoices, portal access…) must also move their rows
  in `mergeContacts` (spec §10).
- New modules live in `src/modules/` and `src/platform/` (spec §4); older code is still the
  reference project `my-tanstack-app` (frozen; GitHub `Fuema/bun_tanstack_neon_cloudflare`)
  until its module is rebuilt.
- **Production deploy waits until the end of the project** (owner decision, spec §3).
- **Start a new phase only when the owner says so.** Documentation work is fine.
- `bun run dev` needs this project's own `.env.local` (see `.env.example`).

## Starting a session
- Read spec §16.1 (handoff), or use the `project-navigator` agent (spec §16 phases and §20
  changelog) to see where things stand.
- Integration tests: `TEST_DATABASE_URL="$(neon connection-string test --project-id
  wandering-river-71683346)" bun run test:integration` (never print the URL).
- Workers free plan: each Neon HTTP query is one subrequest (50 per request): no per-row
  query loops (spec §17 pitfall 15).
- Ask the owner which phase or task is next; follow the phase order unless told otherwise.

## Rules that must never be broken (spec §12.1)
- **Workspace isolation:** every query filters by the workspace from the session, never from input; check every referenced id against the workspace.
- **Contact isolation (portal):** portal queries also filter by the contact's scope and return only portal-visible fields, objects and files.
- **Every server function** has `requirePermission(...)` (or `requireObjectPermission(...)` for custom objects) and a Zod `.validator(...)`; custom-field values are validated on the server against their definitions.
- **No plain exported `db` helpers in modules routes import** — put them in `*.server.ts` (`check:bundle` guards it).
- **English and Spanish:** user-visible text comes from `messages/en.json` and `messages/es.json` through `m.*()` (`#/paraglide/messages.js`), never hard-coded; add every key to both files (`check:i18n` fails otherwise). Pages not yet converted are listed in spec §5.
- Money in integer cents, tax in basis points, dates in UTC (all-day at 12:00 UTC).
- Never edit `.env*`; never print secret values. This project has **its own** Neon database; never point it at `my-tanstack-app`'s.

## Definition of done
`bun run validate` passes (typecheck, Biome, translation keys, unit tests, build,
browser-bundle check), plus a browser check for UI changes. Integration tests run separately.
New business rules get a test in `tests/unit/`. Changes to server code, the schema or
isolation rules also run `bun run test:integration` (Neon `test` branch, `TEST_DATABASE_URL`).

## Git workflow (owner's standing preference)
- Branch per change from `main`; never commit to `main` (the initial import was the only exception).
- Follow the `commit-and-push` skill (`.claude/skills/`): explicit staging, secret scan,
  Conventional Commit, **ask before committing and again before pushing**. `gh` is not
  installed: give the owner the PR link and a pasteable description. On top of it here:
  - run the `security-reviewer` subagent for changes to server functions, routes, permissions, auth, the portal, the schema or seeds
  - code, config, dependency or schema changes include the `specification.md` update (`spec-keeper` subagent)
- Ask before applying migrations (`migration-guard` agent).

## Agents and skills
- `.claude/agents/`: subagents for checks and reports (`project-navigator`, `spec-keeper`,
  `validator`, `resource-builder`, `migration-guard`, `security-reviewer`), updated for this
  project's module layout, i18n and Workers free-plan limits.
- `.claude/skills/`: `commit-and-push`, `setup-resend-email`, `setup-neon-db`, `setup-neon-auth`.
  **This repo is now their master copy**; copy them to `~/.claude/skills/` for other projects.
- `AGENTS.md`: TanStack Intent skill loading.

## Environment notes
- Windows 11, PowerShell + Git Bash, Bun 1.4. `bun run dev` = Vite on Node, port 3000.
- Line endings are LF (`.gitattributes`). The running dev server rewrites `src/routeTree.gen.ts`.
