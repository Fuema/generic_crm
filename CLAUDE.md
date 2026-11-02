# CLAUDE.md

Generic CRM: a multi-tenant CRM for small businesses on TanStack Start +
Cloudflare Workers + Neon Postgres + Better Auth. **Read `specification.md`
first**: vision, decisions, data model, customization engine, portal, phases,
conventions and pitfalls live there.

## Where things stand
- **Phase 0 in progress** (spec §5). The code is still mostly the reference project
  `my-tanstack-app` (frozen; GitHub `Fuema/bun_tanstack_neon_cloudflare`).
- **Start a new phase only when the owner says so.** Documentation work is fine.
- `bun run dev` needs this project's own `.env.local` (see `.env.example`).

## Starting a session
- Use the `project-navigator` agent (or spec §16 phases and §20 changelog) to see where things stand.
- Ask the owner which phase or task is next; follow the phase order unless told otherwise.

## Rules that must never be broken (spec §12.1)
- **Workspace isolation:** every query filters by the workspace from the session, never from input; check every referenced id against the workspace.
- **Contact isolation (portal):** portal queries also filter by the contact's scope and return only portal-visible fields, objects and files.
- **Every server function** has `requirePermission(...)` (or `requireObjectPermission(...)` for custom objects) and a Zod `.validator(...)`; custom-field values are validated on the server against their definitions.
- **No plain exported `db` helpers in modules routes import** — put them in `*.server.ts` (`check:bundle` guards it).
- **English and Spanish:** no hard-coded user-visible text once i18n exists (phase 0).
- Money in integer cents, tax in basis points, dates in UTC (all-day at 12:00 UTC).
- Never edit `.env*`; never print secret values. This project has **its own** Neon database; never point it at `my-tanstack-app`'s.

## Definition of done
`bun run validate` passes (typecheck, Biome, build, browser-bundle check; tests and
i18n checks once phase 0 adds them), plus a browser check for UI changes.

## Git workflow (owner's standing preference)
- Branch per change from `main`; never commit to `main` (the initial import was the only exception).
- Follow the `commit-and-push` skill (`.claude/skills/`): explicit staging, secret scan,
  Conventional Commit, **ask before committing and again before pushing**. `gh` is not
  installed: give the owner the PR link and a pasteable description. On top of it here:
  - run the `security-reviewer` subagent for changes to server functions, routes, permissions, auth, the portal, the schema or seeds
  - code, config, dependency or schema changes include the `specification.md` update (`spec-keeper` subagent)
- Ask before applying migrations (`migration-guard` agent).

## Agents and skills
- `.claude/agents/`: subagents for checks and reports. `project-navigator` and `spec-keeper`
  are updated for this project; `validator`, `resource-builder`, `migration-guard` and
  `security-reviewer` still describe the reference project's layout and are updated in phase 0.
- `.claude/skills/`: `commit-and-push`, `setup-resend-email`, `setup-neon-db`, `setup-neon-auth`.
  **This repo is now their master copy**; copy them to `~/.claude/skills/` for other projects.
- `AGENTS.md`: TanStack Intent skill loading.

## Environment notes
- Windows 11, PowerShell + Git Bash, Bun 1.4. `bun run dev` = Vite on Node, port 3000.
- Line endings are LF (`.gitattributes`). The running dev server rewrites `src/routeTree.gen.ts`.
