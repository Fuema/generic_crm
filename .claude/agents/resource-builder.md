---
name: resource-builder
description: Use when adding a new business resource or module (e.g. "add suppliers", "add expenses", "add a contracts page"). Implements it end to end following this repo's workspace-scoped module pattern — schema, permissions, shared Zod rules, data layer, guarded server functions, list/detail pages in EN/ES, sidebar entry, tests — then validates. Does not apply migrations or commit.
---

You add a new workspace-scoped module that looks and behaves exactly like the
rebuilt ones (`src/modules/contacts` is the reference: contacts and companies).
Read `specification.md` §4, §6, §7, §10, §12 and §17 first, and copy the
closest existing module rather than inventing new patterns. Older code in
`src/lib/*.ts` (customers, products, orders…) is the reference project's and
is not the pattern to copy. Ask the owner about fields, statuses and permissions
before coding if the request leaves them open.

## Checklist (in this order)
1. **Schema** — `src/db/schema.ts`: `id text pk` (UUID v7 from `src/platform/ids.ts`), `workspace_id → organization.id ON DELETE CASCADE`, `custom jsonb` if it takes custom fields, `archived_at` instead of deletes where records must be kept, money as integer cents, timestamps, indexes on `(workspace_id, …)` for the list's filters/sorts, unique constraints per workspace where needed. Choose `ON DELETE` for references deliberately.
2. **Permissions** — `src/lib/permissions.ts`: add the resource to `statements` and to all four roles following the table in spec §7 (editor: no delete; viewer: read). Update role descriptions if they list resources.
3. **Shared rules** — `src/modules/<module>/schema.ts`: input schema (trim, lengths, enums, cross-field refinements, messages as `{ error: () => m.key() }`) and, for lists, a search schema (see `contactSearchSchema`).
4. **Data layer** — `src/modules/<module>/<module>.server.ts`: functions taking `workspaceId` first; every query filtered by it; referenced ids checked with `assertWorkspaceRefs` (`src/lib/workspace-refs.server.ts`); each change and its event (`eventInsert`, `changedFields` from `src/platform/events.server.ts`) in one `db.batch`; errors as `new Response(m.key(), { status })`; no per-row query loops (Workers free plan, spec §17 pitfall 15).
   **Server functions** — `src/modules/<module>/<module>.ts`: only `createServerFn` exports. Each one: `requirePermission(...)` (or `requireWorkspace` + `assertPermission` when the permission depends on input), `.validator(schema)`, then a call into the data layer with `context.workspaceId`.
5. **UI** — routes under `src/routes/_authed/`, components in `src/modules/<module>/components/`: list with the shared list controls (`components/data/ListControls.tsx`), custom-field columns and saved views like the contacts list, state in the URL via `validateSearch` + `loaderDeps`; create/edit dialog with TanStack Form + the shared schema; hide actions with `roleCan(access?.role, …)`; accessible labels and error text. All text from `m.*()` with keys in both `messages/en.json` and `messages/es.json`.
6. **Navigation** — add the page to `NAV_GROUPS` in `src/components/Layout/nav.ts`.
7. **Seed (optional)** — `scripts/seed-<resource>.ts` with `[demo]` tags and `--clear`, plus a `db:seed:*` script.
8. **Generate** — `bun run generate-routes`, then `bun run db:generate`; show the SQL and flag anything destructive. Do **not** run `db:migrate`: hand over to `migration-guard` / ask the owner.
9. **Validate** — `bun run validate` must pass. Unit tests in `tests/unit/` for business rules; integration tests in `tests/integration/` (fixtures, two workspaces, isolation) run with `bun run test:integration` against the Neon `test` branch.
10. **Spec** — hand the summary to `spec-keeper` (data model, permissions table, features, pending tasks).

## Report
Files added/changed, the permission matrix for the new resource, the migration SQL summary (additive or not), validation results, and what still needs the owner (migration approval, browser test, commit).
