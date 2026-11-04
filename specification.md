# Specification — Generic CRM

> Living specification for **Generic CRM**, a multi-tenant CRM for small
> businesses. Every section is a plan until it is marked **Built**. **Read it
> before changing anything; update it in the same PR as any change it
> describes** (`spec-keeper` agent).
>
> Status: **Phase 3 (Work) done** (phases 0–3 done; browser checks of
> phases 1–3 pending; phase 2 merged through #22–#28; phase 3: step 1,
> projects, #29; steps 2 and 3, tasks and activities rebuilt and the old
> `customer` table retired, #30; step 4, files and folders, #31, migration
> `0017` applied to dev; step 5, the phase 3 acceptance check, on
> `test/phase3-acceptance`; next phase 4, the customer portal, when the
> owner says so) ·
> 2026-11-04 ·
> repository `https://github.com/Fuema/generic_crm` (private).
>
> **Current code:** the rebuilt modules live in `src/modules/` (contacts and
> companies, records, fields, views, templates, preferences, csv, pipelines,
> deals, products, quotes, orders, invoices, documents, payments, projects,
> tasks, files) and
> `src/platform/` (§4). Everything else is still the reference project
> `my-tanstack-app` (`https://github.com/Fuema/bun_tanstack_neon_cloudflare`,
> frozen; its `specification.md` documents that code) until its phase
> rebuilds it. **Resuming work? Read §16.1 first.**

**Status labels used below:** `Planned` (designed, not started) · `Carried`
(proven in `my-tanstack-app`, will be ported in phase 0) · `Built` (exists in
Generic_CRM) · `Later` (agreed idea, after the first version).

---

## 1. Vision

One CRM that any small business can use on day one — a consultancy, a shop, a
workshop, a school — without hiring someone to configure it.

- **Sells to people and companies.** The **contact** (a person) is the central
  record; a company is optional. Leads are a stage in a contact's life, not a
  separate table.
- **Adapts instead of forking.** Each business shapes the app with **custom
  fields, field groups, saved views, custom objects (own record types),
  pipelines and file folders**. Industry templates are just saved presets of
  those settings.
- **Includes the customer.** A complete **customer portal** where the business's
  own clients see quotes, invoices and payments, projects, tickets, files and the
  knowledge base.
- **Bilingual.** English and Spanish everywhere, for staff and for customers.
- **Multi-tenant SaaS.** Many businesses (workspaces) on one deployment, strictly
  isolated. No billing plans for now, but usage limits per workspace from day one.

## 2. Product principles

1. **Useful in five minutes.** Creating a workspace applies a template (fields,
   pipelines, content, dashboard); the owner adds data, not configuration.
2. **Few concepts, simple screens.** Four roles, one timeline per record, one
   inbox, sensible defaults. Every screen works on a phone.
3. **Customizable, not programmable.** Owners can add fields, objects, views,
   pipelines and workflows through forms — never code or formulas in v1.
4. **Their data is theirs.** Import and export everything (CSV/JSON); delete a
   contact's data on request; delete a whole workspace.
5. **Cheap to run.** Optional partners per workspace; usage limits on everything
   that costs money (email, AI, storage).
6. **Safe by default.** Workspace isolation on every query, contact isolation on
   every portal query, permission checks on every server function.

## 3. Owner decisions (log)

| Date | Decision |
|---|---|
| 2026-11-02 | Target: small businesses; multi-tenant service; sells to individuals **and** companies |
| 2026-11-02 | Languages: **English and Spanish** from the start |
| 2026-11-02 | Industry templates: mechanism yes; ship **Generic only** (Maritime considered and dropped for now) |
| 2026-11-02 | **Complete customer portal**, with a payments area but **no payment partner yet** |
| 2026-11-02 | Channel: **email only** for now (WhatsApp/SMS later) |
| 2026-11-02 | **No billing plans** for now; specialized **partner services** acceptable behind adapters |
| 2026-11-02 | Customization: **custom fields + field groups, saved views, custom objects, file folders** |
| 2026-11-02 | **Projects** is a real, generic module |
| 2026-11-02 | Start a **new repository** (`Generic_CRM`); the owner seeds it by copying `my-tanstack-app`'s foundation; `my-tanstack-app` stays as a frozen reference |
| 2026-11-02 | **Own Neon project** `generic_crm` (org Mario, `aws-us-east-2`, Postgres 18, default branch `main`), separate from the reference app's project |
| 2026-11-02 | **i18n library: Paraglide JS** (compile-time, typed messages, tree-shaken), after a trial with TanStack Start on Workers. Language follows the person, not the URL |
| 2026-11-02 | **Zero-cost plan:** run on free tiers only (Neon, Cloudflare Workers, Resend, GitHub). Anything paid is flagged first: a custom domain (~$10/year, needed for Resend to email other people, the portal address and passkeys), the Claude API (AI stays optional and off by default), Workers Paid features. Free-tier limits are checked when Queues, R2 and Email Routing arrive |
| 2026-11-02 | **Production deploy at the very end of the project:** the first Cloudflare deploy, production secrets, a production Neon branch and the verified Resend domain move from phase 0 to the end. Phase 0 is complete without them |
| 2026-11-02 | **Generic template content:** contacts Source, Preferred contact method, Birthday, LinkedIn; companies Industry, Size, Website, Annual revenue; shared views Customers, Leads to qualify, No company yet. Existing workspaces add it with a button in Settings → Fields |
| 2026-11-02 | **Saved views, first version:** table views only (board and calendar later); filters combine with AND; a shared view is changed by its creator or an owner/admin |
| 2026-11-02 | **Personal days settings:** the calendar gets a "days" view where each person picks how many days to show (1–14), and the task board a "due within N days" filter (overdue included); both saved per person across devices (`user_preference`) |
| 2026-11-02 | **Custom fields, first version:** list columns and filters for custom fields come with saved views (phase 1 step 4); 12 field types now (date-time, member, record reference and file later); a field's type is fixed once created |
| 2026-11-02 | **Business pages are translated when they are rebuilt** (phases 1–3), not in phase 0: only the pages that are kept (auth, app shell, account, workspace) and the auth emails are converted now |
| 2026-11-02 | **CSV import, existing records:** the person importing chooses per import whether rows matching an existing record (contacts by email, companies by domain) are **skipped or update** that record |
| 2026-11-02 | **CSV import limit: 1,000 rows** per file (and 2 MB) |
| 2026-11-02 | **CSV export includes all fields** (built-in, then created date, then every active custom field), not only the visible list columns |
| 2026-11-03 | **Merging contacts needs `contact:update` and `contact:delete`** (the duplicate is archived) |
| 2026-11-03 | **A merge can't be undone:** the duplicate is archived and the two `contact.merged` events are the audit trail; restoring the duplicate does not bring back its notes, tags or the unique values it gave up |
| 2026-11-03 | **Merge contacts only for now;** merging companies is `Later` (§10) |
| 2026-11-03 | **Phase 2 (Sales) starts**, one PR per step in the order of §16.1 |
| 2026-11-03 | **Quotes, orders and invoices point to a contact plus an optional company.** The old `customer` table stays only for tasks and activities until phase 3 re-ports them, then it is dropped. The dev database's demo orders and invoices will be deleted by a destructive migration (asked first) |
| 2026-11-03 | **Documents are printable pages, not generated PDFs:** quotes and invoices have a printable page in the contact's language ("Print / Save as PDF" in the browser) and emails link to it, because the Workers free plan's ~10 ms CPU per request can't generate PDFs |
| 2026-11-03 | **One tax rate per document** (carried rule from `my-tanstack-app`) |
| 2026-11-03 | **Every deal has a contact;** the company is optional |
| 2026-11-03 | **Accepting a quote** records the acceptance and offers to mark the linked deal won; it does not create an order yet. **"Create order from quote"** comes in phase 2 step 5, once orders are rebuilt on contacts |
| 2026-11-03 | **"Send" emails the full quote** (lines, totals, valid until, notes) in the quote's language; replies go to the member who sent it; until the portal (phase 4) the client accepts by replying |
| 2026-11-03 | **No discounts in v1:** a lower price can be typed on a line; discounts come later, for all documents at once |
| 2026-11-03 | **Orders and invoices point to a contact** plus an optional company and deal (orders also to the quote they came from) |
| 2026-11-03 | **An invoice is created from an order or directly** for a contact or deal |
| 2026-11-03 | **One invoice per order;** voiding the invoice frees the order to be invoiced again |
| 2026-11-03 | **The old demo orders and invoices are deleted** (dev data only: 1 order, 1 invoice): migration `0010` empties `invoice_line`, `invoice`, `order_line` and `sales_order` before adding the new required columns |
| 2026-11-03 | **Who confirms payments:** a payment recorded by an owner or admin (`invoice:pay`) is confirmed at once; an editor's waits as **reported** until an owner/admin confirms or rejects it. Payments customers report in the portal (phase 4) join the same queue |
| 2026-11-03 | **An invoice with reported or confirmed payments can't be voided:** reject or reverse its payments first (credit notes come later) |
| 2026-11-03 | **Payment receipt files come with files and folders** (R2, phase 3), not in phase 2 |
| 2026-11-03 | **A draft invoice created from an order stays tied to it:** it keeps the order's contact, company, lines and tax (only language, owner, notes and custom fields change) and can't be archived (void it instead). Answers the open question of step 5 |
| 2026-11-03 | **Phase 3 (Work) starts** after phase 2 was merged (#28), one PR per step in the order of §16.1 |
| 2026-11-03 | **Files live in Cloudflare R2** in production (free tier 10 GB; Cloudflare likely asks for a payment method to enable R2, which matters only at the final deploy); in dev a git-ignored local-disk stand-in sits behind the same interface (§9) |
| 2026-11-03 | **Retiring the old `customer` table drops the links of tasks and activities to old customers:** the tasks and activities stay and can be linked to contacts again. The destructive migration is asked for first (phase 3 step 3) |
| 2026-11-03 | **A won deal becomes a project with a "Create project" button;** automatic creation comes with workflows (phase 7) |
| 2026-11-03 | **File rights follow the record:** uploading needs `update` on the record, deleting needs `delete` on it or being the uploader, viewing needs `read`; in workspace folders editors upload and owners/admins delete (§9) |
| 2026-11-03 | **Phase 3 steps 2 and 3 in one PR:** tasks and activities are rebuilt and the old `customer` table retired together |
| 2026-11-03 | **A task or activity links to one related record** (`subject_type` + `subject_id`: contact, company, deal, quote, order or invoice) **plus an optional project** |
| 2026-11-03 | **Milestones are tasks flagged `is_milestone`;** a milestone needs a project |
| 2026-11-04 | **Migrations `0015` and `0016` applied to dev** with the owner's explicit approval (`0016` is destructive: it drops the `customer` table with its 5 demo rows and the tasks' and activities' old customer and order links) |
| 2026-11-04 | **Record folders for every current record type** (contact, company, deal, quote, order, invoice, project), plus **payment receipts** as files on the invoice that name their payment |
| 2026-11-04 | **Workspace folders are a nested tree, at most 5 levels deep** |
| 2026-11-04 | **Upload limits: 25 MB per file and 1 GB per workspace** (the R2 free tier is 10 GB in all) |
| 2026-11-04 | **A deleted file is removed for good** (no trash); the `*.file_deleted` event is the trace |
| 2026-11-04 | **Migration `0017_files` applied to dev** with the owner's approval (additive) |

## 4. Stack and architecture `Carried`

Same stack as `my-tanstack-app` (see its specification §2–§4 for versions):
TanStack Start (React 19) on **Cloudflare Workers**, **Neon Postgres** over
HTTP with **Drizzle**, **Better Auth** (self-hosted: MFA and passkeys are
required), Tailwind 4 + shadcn/ui, TanStack Form/Query/Table, Zod, Biome, Bun.

New platform pieces:

| Need | Choice | Notes |
|---|---|---|
| File storage | **Cloudflare R2** (`Built`, phase 3 step 4) | Private bucket `generic-crm-files`, bound as `FILES` in `wrangler.jsonc`; files only through authorized Worker routes. `src/platform/storage.server.ts` reaches it with `import("cloudflare:workers")`; `src/platform/cloudflare.d.ts` declares the binding (no `@cloudflare/workers-types` dependency). In `bun run dev` the Cloudflare Vite plugin runs the server in Miniflare, which keeps the bucket on local disk under `.wrangler/state` (git-ignored): that is the dev stand-in. Plain Bun tests (`NODE_ENV=test`) use an in-memory store; anything else without the binding refuses to store. The real bucket is created at the final deploy (§16.1) |
| Background work | **Cloudflare Queues** + **Cron Triggers** | Campaign sending, workflow runs, reminders, cleanup |
| Inbound email (tickets) | **Cloudflare Email Routing → Email Worker** | Replies to tickets; verify limits at phase 6 |
| Outbound email | **Resend** (`Carried`) | Transactional and campaigns; webhooks for delivery events |
| Translations | **Paraglide JS** (`@inlang/paraglide-js`) | Decided 2026-11-02 (§3). Messages in `messages/{en,es}.json`, compiled to `src/paraglide/` (generated, git-ignored) |
| AI | **Claude API** | Model chosen at phase 9 from the current Claude family |

### Server-function pattern `Carried`
```ts
createServerFn({ method: "POST" })
  .middleware([requirePermission({ deal: ["update"] })]) // 401 / 403
  .validator(zodSchema)                                    // input validation
  .handler(async ({ data, context }) => {
    // every query filters by context.workspaceId
  });
```
Custom objects add a dynamic variant, `requireObjectPermission(objectKey,
action)`, because their permissions live in the database (§7.4).

### Source layout (planned; `src/platform` and `src/modules/` exist since phase 1: `contacts`, `records`, `fields`, `views`, `templates`, `preferences`, `csv`; phase 2 adds `pipelines`, `deals`, `products`, `quotes`, `orders`, `invoices`, `payments`, and `documents` for what quotes, orders and invoices share; phase 3 adds `projects`, `tasks` and `files`, plus `src/platform/storage.server.ts`)
New code follows this layout; older code moves when its module is rebuilt. A module has `schema.ts` (Zod rules and labels shared by forms and server), `*.server.ts` (data layer: every function takes the workspace id first, so integration tests call it directly), a thin server-function file (permission + validator + `context.workspaceId`) and `components/`. Records are archived (`archived_at`), not deleted; ids are UUID v7 (`src/platform/ids.ts`).

```
src/
  routes/
    _guest/…            sign-in flows (staff)
    _app/…              staff app (guarded, sidebar shell)
    p/$workspace/…      customer portal (separate guard and session)
    api/…               auth handler, file download, webhooks
  modules/<module>/     one folder per module: schema rules, server fns, *.server.ts, components
  platform/             auth, permissions, tenancy, events, fields engine, i18n, limits, files
  components/ui/        shadcn (vendor)
  db/schema/            Drizzle schema split per module
templates/              industry templates as data (generic.json)
messages/               UI translations (en, es)
scripts/                seeds, checks
tests/                  unit and integration tests
```

## 5. Phase 0 — foundation to port and clean up `Planned`

The owner created `generic_crm/` and copied `my-tanstack-app` into it (done
2026-11-02, without `.git`, `node_modules`, build output, `drizzle/` and
`.env*`). Claude then trims it to this foundation:

| Keep (adapt) | Replace or drop |
|---|---|
| Better Auth setup: email + verification, social, 2FA (TOTP, email, backup codes), passkeys, rate limits, session rules, password policy, HIBP | ~~`customer` table and pages → rebuilt as Contacts & Companies (phase 1)~~ **Done** (phase 3 steps 2–3, §10): migration `0016` dropped the table and the tasks' and activities' customer links; `src/lib/customers.ts`, `src/components/Customers/*`, `/customers` and its nav entry, the `customer` permission and `scripts/seed-customers.ts` (`db:seed:customers`) removed |
| Workspaces (Better Auth organizations), members, invitations, roles, `requirePermission`, last-used workspace | ~~`project` example → rebuilt as the Projects module (phase 3)~~ **Done** (phase 3 step 1, §10): `src/lib/projects.ts` and the old `src/routes/_authed/projects.tsx` removed |
| App shell: sidebar, top bar, workspace switcher, user menu, theme, logo | ~~Orders, invoices, tasks, calendar → re-ported onto the new data model (phases 2–3), keeping their rules~~ **Done:** orders and invoices in phase 2 step 5; tasks and calendar in phase 3 steps 2–3 (`src/modules/tasks`; `src/lib/tasks.ts`, `src/lib/activities.ts` and `src/components/Tasks/*` removed, `src/lib/calendar.ts` moved into the module) (§10) |
| Email module (Resend + dev console fallback), `email:test` | ~~Legacy files: `src/db.ts`, `header-user.tsx`, `db/init.sql`; starter README~~ **Done** |
| Money/tax/date helpers, document counters, list pattern (URL state, server-side table) | ~~Sentry rules and env vars~~ **Done** (package removed; can be added back later) |
| Tooling: Biome, `validate`, `check:bundle`, `.gitattributes` (LF), `vite dev` on Node | Old migrations: start a **fresh migration history** |
| `.claude/agents/` (adapted), `.claude/skills/` (master copy moves here) | Demo seeds → new seeds per module (`scripts/seed-sales.ts` and `db:seed:sales` removed in phase 2 step 5, because they wrote orders for the old `customer` table; sales demo seeds per module come later; `scripts/seed-customers.ts` and `db:seed:customers` removed in phase 3 steps 2–3; `db:seed:planning` now links its demo tasks to contacts) |
| — | Starter leftovers that the copy left dangling: the `neon-vite-plugin.ts` import in `vite.config.ts` (it auto-provisions a throwaway Neon database and seeds the old to-do schema) and `instrument.server.mjs` (Sentry) in the `build`/`start` scripts. Remove both references. **Done:** also removed `vite-plugin-neon-new`, `@neon/config`, `@neon/env`; package and Worker renamed `generic-crm` |

Phase 0 also adds:
- ~~Own Neon database~~ **Done:** project `generic_crm` linked with `neon init` (`neon.ts` declares Postgres only; Neon Auth off because Better Auth is self-hosted). `neon deploy` pulls `DATABASE_URL` (pooled, used by the app over the HTTP driver), `DATABASE_URL_UNPOOLED` (used by `drizzle-kit`) and `NEON_BRANCH` into `.env.local`. The database is still empty: the fresh migration history comes next.
- ~~**Rename tenant columns to `workspace_id`**~~ **Done:** every app table uses `workspace_id` (`workspaceId` in code), `tenant_setting`/`tenant_counter` are `workspace_setting`/`workspace_counter`, and `requirePermission` puts `context.workspaceId` in the handler context. Better Auth's own tables (`member`, `invitation`, `session.active_organization_id`) keep the library's `organization` names because its organization plugin depends on them.
- ~~**Fresh migration history**~~ **Done:** `drizzle/0000_initial.sql` (21 tables) applied to the `generic_crm` database on 2026-11-02.
- **Automated tests from day one:** `bun test` for unit rules; integration tests on a dedicated Neon branch for isolation (workspace A never sees workspace B). **Unit tests done:** `tests/unit/` (money and tax, all-day/timed dates, the role matrix, input schemas), run by `bun run test` and part of `validate`; written to pass in any time zone (pitfall 8). **Integration tests done:** `tests/integration/` runs against the Neon branch `test` (schema-only copy of `main`) through `TEST_DATABASE_URL` with `bun run test:integration`. A preload refuses to run if the URL is missing or equals `DATABASE_URL`; each run creates randomly named workspaces and deletes them. They cover `assertWorkspaceRefs` across workspaces, per-workspace and concurrent document numbers, settings isolation, per-workspace unique email/SKU and cascade deletes. Not part of `validate` (needs the network and the test branch). Server-function-level isolation tests come in phase 1, when module queries move into `*.server.ts` functions that take the workspace id.
- **i18n setup** (EN/ES) for every string ported. **Setup done:** Paraglide compiles `messages/*.json` (`bun run i18n:compile`, also run by `typecheck` and the Vite plugin); `src/server.ts` wraps every request in `paraglideMiddleware` (it is the Worker entry in `wrangler.jsonc`); `<html lang>` follows the locale; `LanguageSwitcher` saves the choice in the `PARAGLIDE_LOCALE` cookie and reloads; `check:i18n` in `validate` fails on missing or empty translations. **Converted:** all guest/auth pages (sign-in, sign-up, forgot/reset password, two-factor, verify email), their components, the auth validation messages in `src/lib/schema.ts` (Zod messages are `{ error: () => m.…() }` and password rule labels are functions, so server-side checks answer in the request's language) and the Better Auth error messages (`authErrorMessage`); the app shell (sidebar and its navigation labels, top bar, theme toggle, user menu, which now holds the language choice, `<title>`), the account security page and its components, the workspace pages (members, settings, new workspace, billing defaults, invitations) with their validation messages, and the role labels (`ROLE_LABELS` entries are functions). The visible app name comes from the `app_name` message ("Generic CRM" until the product name is decided, §19).; and the auth emails (verification, password reset, sign-in code, invitation, test email) with `<html lang>`. Emails use the language of the request that triggers them: the recipient's own for verification, reset and codes; the inviter's for invitations, until members' saved language preference arrives in phase 1. `APP_NAME` (Better Auth `appName`, TOTP issuer, passkey `rpName`, emails) is `m.app_name()` in the base locale, exported from `src/lib/email.ts`. **Phase 0 i18n is complete** for everything that is kept. Business pages were written with `m.*()` when rebuilt (§3): orders and invoices in phase 2 step 5, projects in phase 3 step 1, tasks, calendar and the dashboard (with its chart components) in phase 3 steps 2–3; the old customers page was removed. **No page is left unconverted.**
- ~~New private GitHub repository, README, complete `.env.example`~~ (done), first Cloudflare deployment, verified Resend domain.

## 6. Domain model `Planned`

```
Workspace ─┬─ Members (users with a role)
           ├─ Settings (language, currency, time zone, branding, limits, modules on/off)
           └─ Template applied (generic)

Company ◄── optional ── Contact (person)  lifecycle: subscriber → lead → qualified → customer → inactive
                           │  owner (member) · tags · consent · preferred language · custom fields
                           ├── Deals (pipeline, stage) ──► Quote ──► Order ──► Invoice ──► Payments
                           ├── Projects ──► Tasks · Files · Notes
                           ├── Tickets ──► Messages ──► Survey response
                           ├── Activities · Appointments · Notes · Emails
                           ├── Campaign recipients
                           ├── Custom object records (via relationships)
                           ├── Files & folders
                           └── Timeline  ◄── Event log (every change, every module)
Knowledge base articles · Products (catalog) · Saved views · Workflows
Portal users = contacts invited to the portal
```

### 6.1 Rules shared by every table
- `id`: text UUID (v7 preferred: time-ordered). `workspace_id` → workspace, `ON DELETE CASCADE`.
- `created_at`, `updated_at`, `created_by` (member or system); soft delete (`archived_at`) where records can be restored.
- Built-in records that accept custom fields carry `custom jsonb not null default '{}'`.
- Money in **integer cents**, tax in **basis points**, timestamps in **UTC**, all-day dates at **12:00 UTC**. One currency per workspace.
- Every write that matters also writes an **event** in the same `db.batch` (§11).

### 6.2 Core tables (first version)

| Table | Purpose | Key rules |
|---|---|---|
| `contact` `Built` | A person | Email unique per workspace (case-insensitive, nullable); `lifecycle_stage`; `owner_id`; `company_id` (one primary company in v1); `locale`; `email_consent` (status, source, date); `custom`; duplicates are merged into one contact (§10) |
| `company` `Built` | An organization | Name; domain unique per workspace (nullable); owner; `custom` |
| `tag`, `record_tag` `Built` | Free labels on any record | Per workspace; name unique case-insensitively; color from a fixed palette (picked from the name); limits: 20 per record, 500 per workspace; a tag removed from its last record is deleted (renaming and recoloring come with the settings pages) |
| `note` `Built` | Free text on any record | Author, pinned flag; appears on the timeline; max 10,000 characters; deleting removes the text (the event log keeps only the fact) |
| `event` `Built` | Event log | §11 |
| `field_group`, `field_definition` `Built` | Custom fields engine | §7 |
| `object_definition`, `custom_record`, `relationship_definition`, `record_link` | Custom objects | §7.4 |
| `saved_view` `Built` | Saved filters/columns/sort | §7.3 |
| `pipeline` `Built` | Pipelines for deals (and later tickets/projects) | `key` unique per workspace (immutable; a template adds a key once); `name` `{ en, es }`; `position`; `archived_at`; at most 10 active and at least 1 active per workspace (§10) |
| `pipeline_stage` `Built` | Ordered stages of a pipeline | `pipeline_id`; `name` `{ en, es }`; `position`; `probability` 0–100; `type` `open`/`won`/`lost` (at least 1 open, exactly 1 won and 1 lost; won = 100, lost = 0); at most 20 per pipeline; archived, never deleted (deals point to them) |
| `deal` `Built` | Opportunity | `name`; `pipeline_id`, `stage_id` (an active stage of an active pipeline); `status` `open`/`won`/`lost` mirrors the stage type (derived on the server, never sent); `value_cents` 0–2,000,000,000; `expected_close_at` (all-day, 12:00 UTC); `contact_id` **required** (an active contact); `company_id` optional (`ON DELETE SET NULL`); `owner_id` (set null); `lost_reason` (required in a lost stage); `closed_at` (set when won or lost); `custom`; `archived_at`. Migration `0007_deals` (§10) |
| `product` `Built` | Catalog | `name` (1–100); `sku` 1–32 characters `[A-Z0-9._-]` starting with a letter or digit, upper-cased, unique per workspace ignoring case (archived products included); `unit_price_cents` 0–2,000,000,000; `description` (≤500); `custom`; `archived_at` (archived, never deleted). `active` is still written equal to "not archived" but no longer read since orders were re-ported (phase 2 step 5); a later cleanup migration drops it. Migration `0008_products_archive` (§10) |
| `quote` `Built` | Quote | `number` unique per workspace (shown `QUO-0001`, from `workspace_counter` kind `quote`); `status` `draft`/`sent`/`accepted`/`declined` ("expired" is worked out on read: sent and past its valid-until day); `contact_id` required, `company_id`, `deal_id`, `owner_id` optional (set null); `locale` `en`/`es` (from the contact); `currency` (snapshot of the workspace's); one `tax_rate_bp`; `subtotal_cents`, `tax_cents`, `total_cents` computed on the server; `valid_until` (all-day; default 30 days after sending); `notes`; `sent_at`, `accepted_at`, `declined_at`, `decline_reason`; `custom`; `archived_at`. Migration `0009_quotes` (§10) |
| `quote_line` `Built` | Quote line | `quote_id` (cascade); `position`; `product_id` (set null; null for free-text lines); `description`, `sku`, `unit_price_cents` copied from the catalog when picked; `quantity`; `line_total_cents` |
| `sales_order` `Built` | Order | `number` unique per workspace (shown `ORD-0001`, `workspace_counter` kind `order`); `status` `draft`/`confirmed`/`fulfilled`/`cancelled`; `contact_id` **required**; `company_id`, `deal_id`, `owner_id` optional (set null); `quote_id` (set null; **one order per quote**: partial unique index on `(workspace_id, quote_id)` where not null); `locale` `en`/`es`; `order_date`; `currency`; one `tax_rate_bp`; `subtotal_cents`, `tax_cents`, `total_cents` computed on the server; `notes`; `custom`; `archived_at`. `customer_id` dropped (§3). Migrations `0010`/`0011` (§10) |
| `order_line` `Built` | Order line | `workspace_id` (cascade, added in `0010`); `order_id` (cascade); `position`; `product_id` (set null); `description`, `sku`, `unit_price_cents` snapshot; `quantity`; `line_total_cents` |
| `invoice` `Built` | Invoice | `order_id` **optional** (no action since `0012`, was restrict: an order with invoices still can't be deleted, but the check runs after a workspace cascade, §17 pitfall 19; **one invoice per order that isn't void**: partial unique index on `(workspace_id, order_id)` where `order_id` is not null and status ≠ `void`); `contact_id` **required**; `company_id`, `deal_id`, `owner_id` optional (set null); `year` + `number` set when issued (shown `INV-2026-0001`, unique per workspace and year); `status` `draft`/`issued`/`partially_paid`/`paid`/`void` (the three paid states derived from confirmed payments, §10); `paid_cents` (sum of confirmed payments, added in `0012`, recomputed in the same batch as every payment change); `paid_at` (set when fully paid, cleared if a reversal reopens it); "overdue" worked out on read (issued or partially paid past the due day); `locale`; `issue_date`, `due_date`, `sent_at`, `voided_at`; `currency`; one `tax_rate_bp`; server-computed totals; `notes`; `custom`; `archived_at`. `customer_id` dropped (§3). Balance = `total_cents` − `paid_cents` |
| `invoice_line` `Built` | Invoice line | `workspace_id` (cascade) and `product_id` (set null), both added in `0010`; otherwise as `order_line` |
| `payment` `Built` | Payment against an invoice | `invoice_id` (no action: blocks deleting an invoice with payments, checked after a workspace cascade); `amount_cents` 1–2,000,000,000; `paid_on` (all-day, 12:00 UTC; not in the future, with one day of slack for time zones east of UTC); `method` `bank_transfer`/`cash`/`card`/`other`; `reference` (≤100); `note` (≤500); `status` `reported`/`confirmed`/`rejected`; `source` `staff`/`portal`; `recorded_by_id`, `decided_by_id` (set null); `decided_at`; `reject_reason`. Indexes on (workspace, invoice, paid on) and (workspace, status). Receipt files: `file.payment_id` (phase 3 step 4, §9). Migration `0012_payments` (§10) |
| `project` `Built` | Project | `name` (1–120); `description` (≤2,000); `status` `planned`/`active`/`on_hold`/`completed`/`cancelled` (default `planned`; any status can be chosen in the form); `start_date`, `due_date` (all-day, 12:00 UTC; due ≥ start); `owner_id` (set null); `contact_id` optional (no action: contacts are archived, not deleted); `company_id` optional (set null); `deal_id` the source deal (set null); `custom`; `archived_at`. Indexes on (workspace, status), (workspace, contact), (workspace, deal), GIN on `custom`. Migration `0014_projects` (additive; existing rows become `planned`). Portal visibility comes with phase 4 |
| `task`, `activity` `Built` | Work items; calls, meetings, emails, follow-ups | `subject_type` + `subject_id`: the one record it is about (`contact`, `company`, `deal`, `quote`, `order`, `invoice`; polymorphic, no foreign key, checked on write: an active record of the workspace when set or changed); `project_id` (set null); `task.is_milestone` (default false; needs a project); `customer_id` and `order_id` dropped. Indexes (workspace, subject_type, subject_id) and (workspace, project_id) on both. Migrations `0015_tasks_subjects` (additive; old `order_id` links copied to `subject_type = 'order'`) and `0016_drop_customers` (destructive; also drops the `customer` table) (§10) |
| `ticket`, `ticket_message` | Support | Number `TCK-0001`; status new → open → waiting on customer → resolved → closed; priority; category; channel; internal notes |
| `kb_category`, `kb_article` | Knowledge base | Title/body per language; draft/published; visibility public / portal / internal; slug |
| `survey`, `survey_invitation`, `survey_response` | Feedback | CSAT/NPS/custom; tokenized invitation links |
| `segment` | Campaign audience | A saved view on contacts, evaluated at send time |
| `campaign`, `campaign_recipient` | Email campaigns | Status draft → scheduled → sending → sent; per-recipient delivery status |
| `workflow`, `workflow_run` | Automation | §11.3 |
| `folder` `Built` | Workspace folder tree | `parent_id` → `folder` (no action: a folder is deleted only when empty); `name`; `created_by_id` (set null); `created_at`, `updated_at`; unique `(workspace_id, coalesce(parent_id, ''), lower(name))`; at most 5 levels (checked on the server). Migration `0017_files` (§9) |
| `file` `Built` | A stored file | `folder_id` (no action; null for record files and the top level); `subject_type` + `subject_id`: the record it belongs to (polymorphic, no foreign key, checked on write, §17 pitfall 21); `payment_id` (no action) for a receipt, which belongs to the invoice; `name` (≤200, the original name); `content_type` from the extension allow-list, never the browser's; `size_bytes`; `storage_key` `workspace/<id>/<uuid>`; `shared_with_customer` (default false; record files only); `uploaded_by_id` (set null); `created_at`. Indexes (workspace, subject_type, subject_id), (workspace, folder), (workspace, payment). Migration `0017_files` (§9) |
| `portal_user`, `portal_session`, `portal_token` | Customer portal auth | §8 |
| `workspace_setting`, `workspace_limit`, `workspace_usage` | Settings and limits | §12 |
| `user_preference` `Built` | A person's display preferences, across workspaces and devices | `calendar_days` (1–14, default 3), `task_due_days` (null = all); only the person reads or changes them (`src/modules/preferences`) |
| `tenant_counter` `Carried` | Document numbering | Per (workspace, kind, year) |

## 7. Customization engine `Planned`

One engine powers custom fields on built-in records **and** custom objects, so
nothing is redone when custom objects arrive.

### 7.1 Custom fields (`Built` for contacts, companies, deals, products, quotes, orders, invoices and projects)
**Built:** `src/modules/fields` (`schema.ts` shared rules and `validateCustomValues`; `values.ts` form ↔ stored conversions and display; `fields.server.ts` definitions and `prepareCustom`, which every contact/company write runs). Stored values: money in cents, percent in basis points, dates `YYYY-MM-DD`, choices by their permanent option value; empty values are removed. Unknown keys are dropped; archived fields keep their values (saved records keep them untouched). An option still used by a record can't be removed (rename it instead); turning on `unique` requires existing values to be unique. Keys never collide with built-in JavaScript names (`constructor` becomes `f_constructor`) and values are read as own keys only. Limits: 75 active fields and 300 in total (archived included) per record type. **Known limits (security review):** the unique check and the "option in use" check are check-then-write without a database constraint, so two saves at the same moment can still store a duplicate value or a value whose option was just removed (rare; the next save of that record shows the problem). Changes appear on the timeline as `custom.<key>`. Settings page `/settings/fields` (owner/admin change; everyone reads), with a tab per record type (Contacts, Companies, Deals, Products, Quotes, Orders, Invoices, Projects). Types `Built`: text, long text, number, money, percent, date, checkbox, single choice, multiple choice, email, phone, URL. `Later`: date-time, member, record reference (with custom objects), file (with file storage, phase 3). A field's type is fixed once created; conversion with a dry run is `Later`.

- **Where:** contacts, companies, deals, quotes, projects, tickets, products, and every custom object.
- **Field types:** text, long text, number, money, percent, date, date-time, single choice, multiple choice, checkbox, email, phone, URL, member (user), record reference (contact/company/custom record), file.
- **Definition** (`field_definition`): object key, immutable `key`, `label` and `help` as `{ en, es }`, type, options (with EN/ES labels), required, default, unique (text/email only), group, position, **portal visibility** (hidden / read-only / editable by the contact), archived flag.
- **Values** live in the record's `custom` JSONB, keyed by the field `key`.
- **Validation:** the server builds a Zod schema from the definitions at request time and validates every write. The client form uses the same builder; the server never trusts it.
- **Lists:** custom fields appear as optional columns and filters in tables and saved views. GIN index on `custom`; expression indexes added for fields that are filtered often.
- **Changing a field:** renaming labels is free; the key never changes; deleting **archives** the field (values kept, hidden) and can be restored; changing type is allowed only when values convert cleanly (e.g. text → single choice with matching options); a dry run reports what would fail.

### 7.2 Field groups (`Built`)
Named, ordered sections on a record page ("Membership", "Billing details"),
with EN/ES labels, collapsible, optionally visible in the portal.

### 7.3 Saved views (`Built` for contacts, companies, deals, products, quotes, orders, invoices and projects, table views)
**Built:** `src/modules/views`: filters on built-in and custom fields with operators by kind (text: contains/is/empty; number, money, percent, date: =, >, <, between, empty; checkbox: checked or not; choices and references: any of, empty), all of which must match (AND); chosen and ordered columns, custom fields included; sort by built-in columns or custom fields (empty values last). The URL holds the state (`filters`, `columns`, `sort`, `dir`, `view`). The server checks every filter against the field definitions (400 otherwise) and builds SQL with bound values only (`filters.server.ts`); numeric custom values are cast only when they are JSON numbers. Views are private or shared; a shared view is changed by its creator or an owner/admin, others can use it or save a copy; unknown columns are dropped when saving; 50 views per member. Deals (phase 2 step 2): filters on name, pipeline, stage, status, company, owner, tag, expected close and created date; columns value, stage, status, contact, company, expected close, tags, owner, created; sort by name, value, expected close or created (default newest first). Products (phase 2 step 3): filters on name, SKU, description, created date and custom fields; columns SKU, price, description, created; sort by name, SKU, price or created (default name A–Z). Quotes (phase 2 step 4): filters on status, company, owner, tag, valid until, created date and custom fields; columns status, contact, company, deal, total, valid until, created; sort by number, total, valid until or created (default newest number first). Orders (phase 2 step 5): filters on status, company, owner, tag, order date, created date and custom fields; columns status, contact, company, deal, order date, total, created; sort by number, order date, total or created (default newest number first). Invoices (phase 2 step 5): filters on status, company, owner, tag, issue date, due date, created date and custom fields; columns status, contact, company, order, issue date, due date, total, created; sort by number, issue date, due date, total or created (default newest first). Projects (phase 3 step 1): filters on name, status, company, owner, tag, start date, due date, created date and custom fields; columns status, contact, company, deal, start, due, owner, created; sort by name, start, due or created (default newest first). The deals board (§10) is a mode of the deals page, not a saved view type. Board and calendar view types, and OR between filters, are `Later`. View server functions use `requireWorkspace` + `assertPermission` on the view's own record type (the input-dependent pattern of §11.2), not the fixed `requirePermission` middleware. **Known limits (security review):** the 50-views limit is check-then-insert (a simultaneous save can go one over); shared views of someone who left the workspace stay visible with their name until an owner/admin deletes them; any member who can read a record type can share a view of it.

A named combination of filters, columns, sort and view type (table, board by a
choice field or stage, calendar by a date field). Private or shared with the
workspace. Segments for campaigns are saved views on contacts.

### 7.4 Custom objects
- **Definition** (`object_definition`): key, singular/plural labels `{ en, es }`, icon, primary (title) field, field groups and fields (§7.1), default views, **permissions per role** (view, create, edit, delete), portal visibility, archived flag.
- **Records** (`custom_record`): `workspace_id`, `object_id`, `title`, `custom` (all values), owner, timestamps.
- **Relationships** (`relationship_definition` + `record_link`): one-to-many or many-to-many between any two objects (built-in or custom), with labels on both sides ("Students" ↔ "Course").
- **Everything works on them:** sidebar entry, list and board views, record page with timeline, files, notes, tasks, import/export, workflows, AI, portal (if enabled).
- **What they are not:** built-in modules with real rules (deals, quotes, invoices, payments, tickets) stay real tables; custom objects hold business-specific information without special logic.
- **Permissions:** checked by `requireObjectPermission(objectKey, action)` against the definition and the member's role, in addition to workspace isolation.

### 7.5 Templates (`Built`: Generic, fields, groups, views and pipelines)
**Built:** `templates/generic.json`, validated at startup (`src/modules/templates/templates.server.ts`). Contacts get a "Profile" group (Source, Preferred contact method, Birthday, LinkedIn); companies a "Profile" group (Industry, Size, Website, Annual revenue); three shared contact views (Customers, Leads to qualify, No company yet), named in the creator's language. Applied when a workspace is created (Better Auth `afterCreateOrganization` and `ensureWorkspace`); a failure is logged and never blocks sign-up. Applying adds only what's missing (fields by key, archived ones included; groups by English label; views by name) and never changes existing content, so workspaces created earlier can add it from Settings → Fields (owners/admins). Template fields keep the template's keys so its views can refer to them. **Pipelines (phase 2 step 1):** the file's `pipelines` list (key, `{ en, es }` name, stages with probability and type, checked with the same stage rules as the server) adds a "sales" pipeline: New lead 10 %, Qualified 25 %, Proposal sent 50 %, Negotiation 75 %, Won, Lost. A pipeline is added only when its key is missing (archived ones count); if a concurrent run already added it (409 and the key now exists), it is skipped; other refusals, such as the pipeline limit, are reported. `templateStatus` and `applyTemplate` loop only over the record types the template touches (3 queries each; looping over every record type had grown to 20+ subrequests); `templateStatus` reports `pipelinesMissing` and `applyTemplate` returns `added.pipelines`; the template card on Settings → Fields counts them. Categories and the rest join the file with their modules.

A template is a **JSON file** in `templates/` with: modules on/off, vocabulary,
field groups and fields, custom objects, pipelines and stages, ticket
categories, starter KB articles, email and survey templates, saved views and
dashboard. Applied once, when a workspace is created; everything stays editable.
**Generic** is the only template in v1. Future industry templates add data, not code.

### 7.6 Limits (initial defaults, tune later)
Custom objects per workspace: 10 · fields per object: 75 · field groups per
object: 15 · saved views per member: 50 · choice options per field: 100 ·
active pipelines per workspace: 10 · stages per pipeline: 20
(`PIPELINE_LIMITS`, `src/modules/pipelines/schema.ts`).

## 8. Customer portal `Planned`

- **Who:** contacts of a workspace, invited by staff (or self-requested with an email the workspace already has). Portal users are **not** members and never see the staff app.
- **Sign-in:** one-time **email link** (no password): token stored hashed, 15-minute expiry, single use, rate limited. Separate session table and cookie (`portal_session`), scoped to the portal path; staff and portal sessions are never interchangeable.
- **Address:** `/p/<workspace-slug>/…` (custom subdomains later).
- **Two isolation levels:** every portal query filters by **workspace** *and* by the **contact scope**: the contact's own records, plus their company's records if staff marked them as a company contact. Only fields and objects marked portal-visible are returned.
- **Sections (v1):** home (open items), profile (portal-editable fields, language), quotes (view, accept/decline — records who, when and from which IP), orders, **invoices & payments**, projects (status, milestones, shared files), tickets (open, reply, attach), knowledge base, surveys, files shared with them, custom objects marked portal-visible.
- **Payments area (no partner yet):** open balance per invoice and in total; payment history; the workspace's payment instructions (bank details, reference to use); **"I've paid"** form with amount, date, reference and optional receipt → creates a `payment` with status *reported*; staff confirm or reject it. A future "Pay online" button (Stripe or similar) creates confirmed payments through an adapter.
- **Branding:** workspace logo, accent color, name; emails to contacts use the same branding.
- **Language:** the contact's `locale`, else the workspace default.

## 9. Files and folders `Built` (phase 3 step 4)

Owner decisions 2026-11-03 and 2026-11-04 (§3). **Built:** `src/modules/files` (`schema.ts`: `FILE_LIMITS`, `ALLOWED_TYPES`, name and input schemas, `fileRights`; `files.server.ts`: data layer; `files.ts`: server functions `listRecordFiles`, `deleteFile`, `setFileShared`, `listFolder`, `listAllFolders`, `createFolder`, `renameFolder`, `moveFolder`, `deleteFolder`, each with `requireWorkspace` + `assertPermission`; `components/`: `FileBits` (`UploadButton`, `FileList`, `RecordFiles`), `FolderDialog`), `src/platform/storage.server.ts` (§4), the routes `POST /api/files` (`src/routes/api/files/index.ts`), `GET /api/files/<id>` (`$fileId.ts`) and the page `/files` (`src/routes/_authed/files.tsx`, nav Work → Files), in EN/ES. Migration `0017_files` (additive: 2 tables, 7 foreign keys, 4 indexes; §6.2), applied to dev on 2026-11-04.

| Topic | Rule |
|---|---|
| Storage | Private R2 bucket in production; Miniflare's local-disk bucket in dev; an in-memory store in plain Bun tests (§4). Object key `workspace/<id>/<uuid>`; the original name lives in the database. Never public URLs |
| Where files live | **Record files** on every current record type (contact, company, deal, quote, order, invoice, project): a "Files" card on each record page. **Payment receipts:** "Attach receipt" per payment on the invoice page; the file belongs to the invoice and names its payment (`payment_id`, checked to be a payment of that invoice). **Workspace folders:** a tree on `/files`, at most 5 levels (owner decision, §3), with breadcrumbs, upload, new / rename / move / delete folder and a storage meter |
| Types and names | Allowed by extension (`ALLOWED_TYPES`): pdf, png, jpg/jpeg, gif, webp, txt, csv, rtf, doc/docx, xls/xlsx, ppt/pptx, odt/ods/odp, zip. No HTML or SVG (they could run scripts). The stored `content_type` comes from this list, never from the browser (415 otherwise). Names ≤200 (folders ≤80) and refuse control characters, slashes, zero-width and bidi marks |
| Limits | 25 MB per file, 1 GB per workspace (`FILE_LIMITS`, owner decision §3; 413). The quota is checked before the upload and again inside the batch under a per-workspace advisory lock, so two uploads at once can't pass it together |
| Rights | **Record files follow the record:** `read` to see and download, `update` to upload and to share; deleting needs the record's `delete`, or being the uploader with `update` while the record isn't archived. **Workspace folders and their files** use the `file` permission resource (owner/admin create, read, update, delete; editor create, read, update; viewer read). `fileRights` maps a file to its record's resource or `file` |
| Upload | `POST /api/files?target=<json>` with the name in `X-File-Name` (URI-encoded). Before reading the body it refuses a foreign `Origin`, a missing or >25 MB `Content-Length`, then checks the session, the active workspace and the permission; it then streams the body to the bucket (`FixedLengthStream`, `sizedBody`): the body must match the declared size exactly (400 otherwise). The row and its event go in one `db.batch`; if the batch fails, the object is deleted |
| Download | `GET /api/files/<id>`: session, active workspace, the file in that workspace, `read` on its record (or `file:read`); otherwise 404, with no hint whether the file exists (401 without a session, 403 without an active workspace). One check, `authorizeDownload(access, fileId)` in `files.server.ts`; the route only builds `access` from the session. Sent as an attachment with `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` and `private, no-store` |
| Sharing | Only record files can be marked **shared with customer**. The portal (phase 4) must show only shared files of records in the contact's scope |
| Folders | Unique name per parent ignoring case. Create and move take a per-workspace advisory lock and re-check depth and cycles inside the batch (409). A folder is deleted only when empty (no subfolders, no files) |
| Deleting | Removed for good, no trash (owner decision, §3): the row and its event first, then the object. Deleting a workspace removes its objects by prefix (Better Auth `afterDeleteOrganization` → `deleteWorkspaceObjects`); the rows go with the cascade |
| Events | `<record>.file_added` / `file_deleted` / `file_shared` / `file_unshared` on the record (payload `fileId`, `name`, and `paymentId` for a receipt, read "Receipt added"); workspace files `file.file_added` / `file.file_deleted` (subject type `file`); `folder.created` / `renamed` / `moved` / `deleted`. File events show on the record's own timeline but not on related records' timelines (§11.2) |
| Merge | `mergeContacts` moves the duplicate's files to the kept contact inside its batch (no event, not counted in the payload) |
| Known limits (security review: no critical/high; M1–M3 and L1–L6 fixed) | Files can't be moved between folders yet. An object is orphaned if the Worker dies between storing it and the batch, or if deleting the object fails (no sweep job yet). The contact page now calls 12 server functions (one more: `listRecordFiles`): measure subrequests per page before the deploy (§17 pitfall 15). Upload CPU and memory on Workers are unmeasured until the deploy. The 1 GB quota is a constant, not yet a `workspace_limit` row (§12.3) |

Tests: `tests/unit/files.test.ts` (5) and `tests/integration/files.test.ts` (7: record file lifecycle and timeline; type, size and quota; receipts; folder tree rules; concurrent quota, a short body and workspace deletion removing objects; sharing rules and merge; isolation); the workspace-deletion test in `isolation.test.ts` covers `folder` and `file`.

## 10. Modules — first version

| Module | First version | Later |
|---|---|---|
| **Contacts & companies** `Built` | Contact-first records, optional company, lifecycle stage, owner, tags, notes, custom fields, timeline, merge duplicate contacts (`Built`, below), CSV import/export (`Built`, below) | Several companies per contact, enrichment, merging duplicate companies (owner decision 2026-11-03) |
| **Deals** `Built` (pipelines and deals, below; "Create project" on a won deal since phase 3 step 1) | Several pipelines, board and list, value, expected close, won/lost with a required reason, owner, contact required + optional company, link to project | Forecasts, products on deals |
| **Products** `Built` (below) | Catalog with SKU, price, description, custom fields and saved views; archived, never deleted; a picker for document lines | Price lists, variants, stock |
| **Quotes** `Built` (below) | From a deal or contact; catalog lines plus free-text lines; one tax rate; validity; printable page instead of a PDF (§3); send by email; staff mark it accepted until the portal (phase 4) accepts/declines → order ("Create order", step 5) | E-signature (partner), versions, discounts (for all documents, §3) |
| **Orders & invoices** `Built` (below, phase 2 step 5) | On contacts; order from an accepted quote, a contact or a deal; invoice from an order or direct; numbering on issue; printable page and send by email | Credit notes, recurring invoices |
| **Payments** `Built` (below, phase 2 step 6; customer-reported payments come with the portal, phase 4) | Record and confirm payments, partial payments, balances, customer-reported payments | Online payments (partner), credit notes (receipt files `Built` in phase 3 step 4, §9) |
| **Projects** `Built` (record, list, page and "Create project" from a won deal: phase 3 step 1; tasks, activities and milestones: steps 2–3; both below; files: step 4, §9; portal view in phase 4) | Status, dates, owner, contact/company, source deal; tasks, milestones (tasks flagged as milestone), files, notes; portal view | Time tracking, budgets, Gantt |
| **Tasks & calendar** `Built` (phase 3 steps 2–3, below) | Board and calendar, each task or activity about one record (contact, company, deal, quote, order or invoice) plus an optional project; milestones are tasks flagged as milestone; a "Tasks and activities" card on record and project pages | Recurring tasks, reminders by email; custom fields, saved views and tags on tasks and activities (they need a table view) |
| **Tickets** | From email, portal or staff; inbox with filters; status, priority, category, assignee; email replies threaded; internal notes; KB suggestions | SLA timers, canned replies |
| **Knowledge base** | EN/ES articles, categories, draft/published, public / portal / internal | Article feedback, versions |
| **Surveys** | CSAT and NPS plus simple question types; send after ticket close (workflow) or by hand; results on the contact | Branching logic |
| **Email campaigns** | Segments, consent and unsubscribe, EN/ES content per recipient language, a few templates, scheduled sending through queues, delivery/open/click stats via Resend webhooks | A/B tests, drip sequences |
| **Workflows** | §11.3 | Visual builder, branches, webhooks |
| **Dashboard & reports** (`/dashboard` rewritten on contacts in phase 3 steps 2–3, below; per-module dashboards still to come) | Home dashboard per module (pipeline value, win rate, open tickets, receivables, overdue); every chart with a table view | Custom reports |
| **AI assistant** | §13 | — |
| **Social publishing** | — | Through a partner (e.g. Ayrshare), after v1 |

### CSV import and export (`Built` for contacts and companies)
**Built:** `src/modules/csv`: `csv.ts` (RFC 4180 reader/writer shared by browser and server, `CSV_LIMITS`), `columns.ts` (importable fields per record type with EN/ES header aliases, value parsing in either language), `transfer.server.ts` (data layer), `transfer.ts` (server functions `exportCsv`, `importCsv`), `components/CsvActions.tsx` (Export and Import buttons on the contacts and companies list pages). The list queries' WHERE/ORDER BY are shared with the export (`contactQuery`/`companyQuery`, `exportContactRows`/`exportCompanyRows` in `contacts.server.ts`).

| Topic | Rule |
|---|---|
| Permissions | Both use `requireWorkspace` + `assertPermission`: export needs the record type's `read`; import needs `create`, plus `update` in update mode; a contact import creates missing companies only with `company: create` (otherwise those rows are errors) |
| Export content | All fields (owner decision, §3): built-in fields, then "Added" (created date, `YYYY-MM-DD`), then active custom fields by label; headers in the exporter's language; owner as member email, company and tags by name |
| Export rows | The records matching the list's current search and filters (all pages, not only the visible one), capped at 10,000 rows |
| Export safety | UTF-8 BOM so Excel shows accents; cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading `'` (CSV formula injection) |
| Import flow | 3-step dialog: choose a file → map columns (headers recognised in EN/ES, any case or accents; aliases in `columns.ts`) and choose **skip** or **update** for existing records → "Check the file" (dry run: counts and per-row errors, at most 100 shown) → import |
| Import limits | 1,000 rows and 2 MB per file (owner decision, §3); a `;` separator (Spanish Excel) is detected from the header line. The browser parses the file and sends it in batches of 100 rows (`CSV_LIMITS.importBatch`): the Workers free plan allows 50 subrequests (each Neon HTTP query is one) and about 10 ms CPU per request. Each batch costs about 8 queries plus one `db.batch`. Earlier rows travel with each batch, reduced to their email/domain and unique custom values, so duplicates across batches are still found. The server enforces the batch size and the 1,000-row total |
| Matching | Existing records by email (contacts) or domain (companies), case-insensitive, within the workspace only (archived records count as existing); duplicates inside the file are reported as row errors; unique custom fields are checked against the database and the rest of the file |
| Values | Owner matched by member email; stage, consent and choice values accepted in EN or ES; money and percent stored ×100 (cents / basis points); companies named in a contact file are created when missing; companies matched by name ignoring case and accents; tags must pass `tagNameSchema`, stay within 20 per record and 500 per workspace, and are found by name (case-insensitive) or created; a cell exported with the formula `'` comes back without it |
| Writes | Each batch is one `db.batch` (one transaction): new companies, new tags, new records with their `*.created` events (payload `{source:"import"}`), updates with `*.updated` events (`changedFields`, only fields whose cells are non-empty; a required custom field the file leaves out keeps its stored value), tag links and `*.tag_added` events. A unique or foreign-key violation (someone created the same email, domain or tag, or deleted a tag, company or owner meanwhile) writes nothing of that batch and reports its rows as errors; other database errors are logged and shown as a generic error; custom values merge in SQL (`custom || patch`) and a record archived meanwhile isn't updated; if a later batch fails, the dialog says how many rows were saved. Archived matches are row errors in update mode |
| Trust | The server re-validates every row against the same Zod rules and custom-field definitions as the forms, and re-checks owners, companies, tags, duplicates and unique values against the workspace; the browser preview is never trusted. Request size is bounded: 100 rows of up to 100 cells of 2,000 characters per batch; earlier rows of at most 320-character cells and no more than `start`. No rate limit yet (an editor can repeat imports), and the 1,000-row total is a usability limit, not a security one (a client can send more batches). Export shows owners as user emails, even of former members |
| Known limits | Companies are matched against the database by exact name ignoring case (accents and punctuation are compared only within the file), so "Telefonica" in a file creates a second company next to "Telefónica"; a row that fails still claims its email/domain and unique values, so a later row with the same value is reported as a duplicate; the dry run checks the 500-tag limit per batch, so a file adding hundreds of new tags can pass the check and stop at a later batch |

No migration. Tests: `tests/unit/csv.test.ts` (5: quoting, BOM and `;`, formula neutralizing, EN/ES headers and values) and `tests/integration/csv.test.ts` (9: dry run writes nothing, creates with company/tags/custom values/events, skip vs update, another workspace's records aren't matched, duplicates and companies/tags across batches, tag names and company permission, formula `'` stripped on re-import, unique custom values and an empty required cell on update, export content).

### Merging duplicate contacts (`Built`)
**Built:** `src/modules/contacts/merge.ts` (pure rules shared by the screen and the server: `MERGE_FIELDS`, `mergeConflicts`, `mergeSource`, `mergeValues`, `mergeTags`, input schemas), `searchMergeCandidates` and `mergeContacts` in `contacts.ts` / `contacts.server.ts`, `components/MergeContactDialog.tsx`, route `/contacts/merge?keep=&duplicate=` (`src/routes/_authed/contacts/merge.tsx`). Companies are not merged yet (`Later`, §3).

| Topic | Rule |
|---|---|
| Permissions | Searching candidates needs `contact:read`; merging needs `contact:update` **and** `contact:delete`, because the duplicate is archived (owner decision, §3). The "Merge with…" button is hidden on archived contacts and for roles without both permissions |
| Flow | "Merge with…" on the contact page opens a search dialog of other **active** contacts in the workspace (name, email or phone; 10 results) → side-by-side screen with a "Swap which is kept" button. The screen shows the notes and tags that will move and that the merge can't be undone; confirming asks once more |
| Values | Built-in fields (`MERGE_FIELDS`: names, email, phone, job title, company, owner, stage, language, email consent) and every custom key on either contact. A field with different non-empty values on both sides needs a choice (default: the kept contact's); an empty side takes the other's value; text compares ignoring case and surrounding spaces; unknown email consent counts as empty, so a known consent is never lost; when both are known and differ, **revoked wins by default**, so an opt-out is never lost by one click. The consent's source and date (`emailConsentSource`, `emailConsentAt`) come from the same side as the consent. An owner taken from the duplicate who is no longer a member, or an archived company, falls back to the kept contact's value |
| Trust | The browser sends only `{ keepId, duplicateId, choices }` (`choices`: field → `"keep"`/`"duplicate"`, at most 200). The server loads both contacts from the workspace (archived ones → 409), recomputes the values with the same rules and validates custom values with `prepareCustom`, which now takes several ids to skip in the unique check (the kept contact and the duplicate) |
| Tags | The kept contact gains the duplicate's tags it lacks; if that goes over 20 per record, the merge is refused (409) |
| Writes | One `db.batch`: (0) a guard that locks both rows (`SELECT … FOR UPDATE`) and divides by zero unless both are still active, so a concurrent merge or archive fails the whole batch → 409 "archived or merged meanwhile"; (1) the duplicate gives up the email and the unique custom values the kept contact takes (cleared on it) and is archived; (2) the kept contact is updated; (3) notes move to it; (4) tag links are added (existing ones skipped, `ON CONFLICT DO NOTHING`) and the duplicate's removed; (5) a `contact.merged` event on each (§11.1). Clearing the duplicate first keeps the email index and unique custom values valid. A unique violation from a concurrent write → 409 and nothing is saved. About 8 subrequests plus one per unique custom field (Workers limit 50) |
| History | The duplicate's own events stay on its timeline; the timeline shows "Merged X into this contact" on the kept one and "Merged into X" on the duplicate |
| Undo | None (owner decision, §3). Restoring the archived duplicate does not bring back its notes, tags or the unique values it gave up |
| Later modules | Every module that points to contacts must move its rows to the kept contact inside `mergeContacts`' batch when it is built. **Deals do** (phase 2 step 2, `dealsMoved`; no `deal.updated` event on them yet), and so do **quotes** (phase 2 step 4; not counted in the `contact.merged` payload, no `quote.updated` event on them); so do **orders and invoices** (phase 2 step 5; no event on them, not counted in the payload); so do **projects** (phase 3 step 1; no event, not counted in the payload); so do **tasks and activities** whose record is the duplicate (phase 3 steps 2–3; no event, not counted); so do **files** (phase 3 step 4, §9; no event, not counted); tickets and portal access follow |

No migration. Tests: `tests/unit/merge.test.ts` (10: conflicts, unknown consent, revoked consent wins, empty sides, choices, ignored choices, empty values not stored, tag limit, same contact, choice values) and `tests/integration/merge.test.ts` (4: values, notes, tags, uniqueness and archiving; archived/self/tag-limit refusals; two opposite merges at once, exactly one wins; no merging or finding across workspaces).

### Pipelines and stages (`Built`, phase 2 step 1)
**Built:** `src/modules/pipelines` (`schema.ts`: rules, labels, `PIPELINE_LIMITS`, `stagesProblem`, `normalizedProbability`; `pipelines.server.ts`: data layer; `pipelines.ts`: server functions `listPipelines`, `createPipeline`, `updatePipeline`, `archivePipeline`, `restorePipeline`; `components/PipelineDialog.tsx`) and the page Settings → Pipelines (`src/routes/_authed/settings/pipelines.tsx`, with a nav entry). Migration `0006_pipelines` (additive). `LocalizedInputs` (`fields/components/FieldDialogs.tsx`), `labelSchema` and `localizedText` (`fields/schema.ts`) are now exported for reuse.

| Topic | Rule |
|---|---|
| Permissions | `pipeline` statement: owner/admin create, read, update, delete; editor and viewer read. Archiving and restoring need `delete` |
| Stage rules | At least 1 open stage, exactly 1 won and 1 lost; probability 0–100, but the server forces won = 100 and lost = 0; at most 20 stages per pipeline; names `{ en, es }` with at least one filled |
| Limits | At most 10 active pipelines per workspace (checked on create and restore). A workspace keeps at least 1 active pipeline: archiving the last one is refused (409) |
| Concurrency | Every pipeline write (create, save, archive, restore) starts its `db.batch` with a per-workspace advisory lock (`pg_advisory_xact_lock`), then a guard statement re-checks its preconditions inside the transaction (pipeline still active, listed stage ids still its active stages, the limit, not the last active pipeline). A failed guard divides by zero, which rolls back the whole batch, event included, and answers 409 "changed meanwhile". Checks before the batch only give friendlier messages. New positions are computed in SQL. The Zod schema caps the stage array at 20 before validating each stage |
| Saving | The dialog sends the name and the **whole ordered stage list**. Listed ids must be this pipeline's active stages, each listed once (400 otherwise); stages without an id are added; every other active stage of the pipeline is **archived, never deleted** (deals will point to them), so after a save the pipeline has exactly the saved list, whatever a concurrent save did. One `db.batch` per save. An archived pipeline can't be edited (409) |
| Keys | Immutable `key`, unique per workspace: from the name (with `_2`, `_3`… when taken) or given by a template (`sales`); a concurrent duplicate → 409 |
| Events | `pipeline.created` (payload `key`, `stages`), `pipeline.updated` (`stagesAdded`, `stagesArchived`), `pipeline.archived`, `pipeline.restored`, each in the same `db.batch` as the change |
| UI | Settings → Pipelines lists active and archived pipelines; the dialog edits the EN/ES name and the stages (reorder, type, probability, add, remove); archive and restore buttons |
| With deals (step 2) | A stage holding non-archived deals (open or closed) can't be left out of a save (409), and its type can't change, because deal status mirrors it (409); a pipeline with open deals can't be archived (409). Each has a check before the batch (friendly message) and a guard inside it (a deal moved in meanwhile) |

Tests: `tests/unit/pipelines.test.ts` (4: stage shape, 20-stage limit, won/lost probability, input schema) and `tests/integration/pipelines.test.ts` (6: create, then save the whole list with update/add/reorder/archive; broken shapes and unknown or duplicated ids refused; archive/restore and the last active pipeline; a stage id from another pipeline of the same workspace refused; two archives at once leave exactly one active pipeline and one event; no reach across workspaces); the workspace-deletion test in `isolation.test.ts` covers `pipeline` and `pipeline_stage`; `templates.test.ts` also checks the Sales pipeline and that a second run adds nothing.

### Deals (`Built`, phase 2 step 2)
**Built:** `src/modules/deals` (`schema.ts`: input schemas, `DEAL_STATUSES`, `MAX_DEAL_CENTS`, `dayToStored`/`storedToDay`, `lostReasonProblem`; `deals.server.ts`: data layer; `deals.ts`: server functions `listDeals`, `listDealBoard`, `getDeal`, `createDeal`, `updateDeal`, `moveDeal`, `archiveDeal`, `restoreDeal`, `listRelatedDeals`, `searchDealContacts`; `components/`: `DealFormDialog`, `StageMover`, `RelatedDeals`, `DealBits`) and the routes `/deals` (`src/routes/_authed/deals/index.tsx`) and `/deals/$dealId`. Migration `0007_deals` (additive). `lockPipelines`, `guard` and `errorCode` are now exported from `pipelines.server.ts` for reuse. CSV stays contacts and companies only (`CSV_OBJECT_KEYS` in `csv/columns.ts`).

| Topic | Rule |
|---|---|
| Permissions | `deal` statement: owner/admin create, read, update, delete; editor create, read, update; viewer read. Archiving and restoring need `delete`. The form's contact picker (`searchDealContacts`) needs `contact:read` |
| Status | `status` and `closed_at` are derived from the stage's type on the server; moving into a lost stage needs a reason (a dialog asks for it); leaving a won or lost stage reopens the deal |
| References | A deal moves only into an active stage of an active pipeline. The contact must be active when set or changed; company and owner are checked when set or changed (an unchanged archived company, or an owner who left, doesn't block an edit). Dates must be real calendar days (`2024-02-31` is refused, §17 pitfall 16) |
| Concurrency | Every write that sets or keeps a stage (create, edit, move, restore) starts its `db.batch` with the pipelines' per-workspace advisory lock, then a guard that the stage is still active, that the deal is still in the stage it was read in (two moves, or an edit and a move, can't both win: 409 "changed meanwhile"), and that the contact is active when set or changed. Restoring needs the deal's stage and pipeline to still be active (409 otherwise) |
| Events | `deal.created`, `deal.updated` (`changes`; custom fields as `custom.<key>`), `deal.stage_changed` (`fromName`/`toName`), `deal.won`, `deal.lost` (`reason`), `deal.reopened`, `deal.archived`, `deal.restored`, each in the same `db.batch` as the change. Timeline: "Moved to X", "Marked as won", "Marked as lost: reason", "Reopened" |
| List | `/deals`: saved views and filters (§7.3), search over the deal name and its contact and company, total value of the matching deals |
| Board | Board mode of `/deals`, per pipeline: one column per active stage with its count and value; each card has a stage picker (no drag and drop); shows open deals plus deals won or lost in the last 90 days, with the list's search and filters; at most 500 cards (`BOARD_LIMIT`; a notice says when the board is cut) |
| Deal page | `/deals/$dealId`: status, value, stage picker, edit, archive/restore, tags, notes, custom fields, timeline |
| Contact and company pages | A Deals card lists their active deals, with "New deal" prefilled with the contact or company; pipelines and fields load only when the form opens |
| Merge | `mergeContacts` moves the duplicate's deals to the kept contact inside its batch (payload and result `dealsMoved`) |
| Shared engine | `deal` is in `SUBJECT_TYPES` (tags, notes, timeline) and `OBJECT_KEYS` (custom fields with a "Deals" tab in Settings → Fields, saved views) |
| Known limits (security review) | Deals moved by a merge get no `deal.updated` event (audit gap, `Later`). Subrequest headroom: `templateStatus` now runs 10 sequential queries and the contact and company page loaders call 6 server functions; well under the limit of 50 but worth watching as modules join (§17 pitfall 15) |

Tests: `tests/unit/deals.test.ts` (7: valid input and lost-reason default, name and contact required, value range, real calendar days, lost stage needs a reason, all-day storage, list search defaults) and `tests/integration/deals.test.ts` (9: create, move, win, reopen and lose; field changes, tags and notes; bad references; stage removal and pipeline archive with deals; stage type locked and restore only into an existing stage; two moves at once; merging moves deals; list, filters and board; no reach across workspaces); the workspace-deletion test in `isolation.test.ts` covers `deal`; `merge.test.ts` expects `dealsMoved`.

### Products (`Built`, phase 2 step 3)
**Built:** `src/modules/products` (`schema.ts`: input schemas, `MAX_PRICE_CENTS`, `productSearchSchema`, `productPickerSchema`; `products.server.ts`: data layer; `products.ts`: server functions `listProducts`, `pickProducts`, `createProduct`, `updateProduct`, `archiveProduct`, `restoreProduct`; `components/ProductFormDialog.tsx`) and the route `/products` (`src/routes/_authed/products/index.tsx`) in EN/ES. Migration `0008_products_archive` (additive: `custom`, `archived_at`; a backfill sets `archived_at = updated_at` for products that were inactive), applied to dev on 2026-11-03. Edits, archives and restores lock the product row and re-check its state inside the batch (archived or not), so two archives at once write one event and an edit can't land on a product archived meanwhile (409 "changed meanwhile"). Removed: `src/lib/products.ts`, the old `src/routes/_authed/products.tsx` page and the old product Zod schemas in `src/lib/schema.ts`.

| Topic | Rule |
|---|---|
| Permissions | `product` statement (unchanged): owner/admin create, read, update, delete; editor create, read, update; viewer read. Archiving and restoring need `delete`; the picker needs `read` |
| Values | Name required, ≤100; SKU 1–32 characters `[A-Z0-9._-]`, trimmed and upper-cased, unique per workspace ignoring case, archived products included (409, also when a concurrent save hits the unique index); price in integer cents 0–2,000,000,000; description ≤500; custom values validated by `prepareCustom` |
| Archive | Products are archived, never deleted (the old delete is gone), because documents point to them. An archived product can't be edited (409). Archiving still sets `active = false` and restoring sets it back, but nothing reads `active` since orders were re-ported (step 5); a later cleanup migration drops it |
| Events | `product.created`, `product.updated` (`changes`; custom fields as `custom.<key>`), `product.archived`, `product.restored`, each in the same `db.batch` as the change. Products are not in `SUBJECT_TYPES`, so they have no tags, notes or record page yet |
| List | `/products`: saved views and filters (§7.3), search over name, SKU and description, active or archived, price column in the workspace currency |
| Picker | `pickProducts`: active products for the line pickers of quotes, orders and invoices (shared `DraftEditor`), searched by name or SKU; at most 20 results when searching, 1,000 otherwise |
| Shared engine | `product` is in `OBJECT_KEYS` (custom fields with a "Products" tab in Settings → Fields, saved views) |
| Snapshot | Quotes, orders and invoices copy the product's name, SKU and price onto their lines, so later product changes never alter them |

Tests: `tests/unit/products.test.ts` (5: SKU trimmed and upper-cased, SKU characters, price range in whole cents, name required, list search defaults) and `tests/integration/products.test.ts` (5: create and update with events and case-insensitive per-workspace SKUs; archiving hides from the picker and keeps the SKU taken; two archives at once write one event; custom fields validated and filterable; no reach across workspaces). The integration tests wait for migration `0008` and a recreated `test` branch.

### Quotes (`Built`, phase 2 step 4)
**Built:** `src/modules/quotes` (`schema.ts`: `QUOTE_STATUSES`, `QUOTE_DISPLAY_STATUSES`, `QUOTE_LIMITS`, `displayStatus`, `defaultValidUntil`, `quoteTotals`, input schemas; `quotes.server.ts`: data layer; `quotes.ts`: server functions `listQuotes`, `getQuote`, `createQuote`, `updateQuote`, `sendQuote`, `reopenQuote`, `acceptQuote`, `declineQuote`, `archiveQuote`, `restoreQuote`, `listRelatedQuotes`; `quote-email.server.ts`: the quote email; `components/`: `QuoteEditor`, `QuoteDocument`, `QuoteStatusBadge`, `RelatedQuotes`) and the routes `/quotes` (`src/routes/_authed/quotes/index.tsx`) and `/quotes/$quoteId`, in EN/ES. Migration `0009_quotes` (additive: 2 tables, 8 foreign keys, 6 indexes), applied to dev on 2026-11-03 and verified (row counts unchanged). `src/lib/email.ts` now exports `sendEmail` (with an optional `replyTo`, sent to Resend as `reply_to`) and `escapeHtml`; `quoteNumberLabel` is in `src/lib/money.ts`; `nextDocumentNumber` accepts kind `quote`; `ContactPicker` is exported from `DealFormDialog.tsx` for reuse.

| Topic | Rule |
|---|---|
| Permissions | `quote` statement: owner/admin create, read, update, delete; editor create, read, update (sending, accepting, declining and "Back to draft" are `update`); viewer read. Archiving and restoring need `delete` |
| Creating | "New quote" picks a contact (on `/quotes`) or starts from a contact or deal page; it creates an empty draft at once. From a deal, the deal's contact and company come along; otherwise the contact's company. Language from the contact (`en`/`es`), currency and default tax rate from the workspace settings, owner = the member creating it. The contact (and deal) must be active |
| Drafts | Only drafts can be edited (409 otherwise). The editor saves the fields and the **whole ordered line list** in one `db.batch` (lines deleted and re-inserted). The server recomputes line totals, subtotal, tax (rounded once on the subtotal, `computeTotals`) and total; the browser's totals are never trusted. Limits: at most 100 lines, quantity 1–1,000,000, unit price and every amount ≤ 2,000,000,000 cents (32-bit columns), tax 0–10,000 bp, notes ≤ 2,000. Contact, company and owner are checked when set or changed |
| Lines | Catalog lines copy the product's name, SKU and price (snapshot, then editable on the line; no discounts, §3); free-text lines have no product. A `productId` must be a product of the workspace; a product newly added must be active, while one already on the quote and archived since may stay (400 otherwise) |
| Sending | "Send" from a draft: by email or "mark as sent" only. Needs at least 1 line; email needs the contact's address. The valid-until day defaults to 30 days later (12:00 UTC) and can't be in the past (400). The email is the full quote (lines, totals, valid until, notes) in the quote's language, every value escaped, `reply_to` the sending member; until the portal the client accepts by replying (§3). The status is saved first; if the email then fails, the answer is 502 but the quote stays sent (send it again after "Back to draft") |
| Statuses | draft → sent → accepted / declined. **Expired** is not stored: a sent quote past its valid-until day reads as expired (`displayStatus`, also in list filters), because the free plan has no cron for it. Accept only while sent and not expired; decline (optional reason ≤500) from sent or expired; "Back to draft" from sent or expired; accepted and declined are final. Archive/restore need `delete` |
| Accepting | Records the acceptance (`accepted_at`, `quote.accepted`) and returns the deal; the page then offers "Mark deal won", which moves the deal to its pipeline's won stage through `moveDeal` (needs `deal:update`). Accepting creates no order by itself; an accepted quote shows "Create order" (step 5, `order:create`, one order per quote, below) and its orders |
| Concurrency | Every edit and status change locks the quote row (`SELECT … FOR UPDATE`) and guards its status (and not archived) inside the batch; a failed guard divides by zero → 409 "changed meanwhile", nothing saved. Archive and restore use the same lock and guard. Sending and accepting also check the quote is exactly the version that was read (its `updated_at`), so what is emailed or accepted is what is saved |
| Email limits | Quote emails leave from the app's address, so they are capped: 50 per workspace in 24 hours and 5 per quote (`QUOTE_LIMITS`; 429). "Mark as sent" has no cap. Line breaks are stripped from every email subject |
| Events | `quote.created` (`number`, `dealId`), `quote.updated` (`fields` changed, `lines`, `totalCents`, `custom`), `quote.sent` (`email`), `quote.accepted` (`totalCents`), `quote.declined` (`reason`), `quote.reopened`, `quote.archived`, `quote.restored`, `quote.ordered` (`orderId`, `number`; written by "Create order", step 5), each in the same `db.batch` as the change |
| List | `/quotes`: saved views and filters (§7.3), search by number (`QUO-12`, `12`), contact, company or deal; status filter including expired; active or archived; total value of the matching quotes |
| Quote page | `/quotes/$quoteId`: the editor for drafts (catalog picker via `pickProducts` and free-text lines, live totals); the printable document in the quote's language with "Print / Save as PDF" (`window.print()`; the sidebar, top bar and page controls are `print:hidden`); actions by status; tags, notes, custom fields, timeline |
| Contact and deal pages | A Quotes card lists their active quotes; "New quote" creates a draft from that contact or deal |
| Merge | `mergeContacts` moves the duplicate's quotes to the kept contact inside its batch |
| Shared engine | `quote` is in `OBJECT_KEYS` (custom fields with a "Quotes" tab in Settings → Fields, saved views) and `SUBJECT_TYPES` (tags, notes, timeline) |
| Known limits | Quotes moved by a merge get no event and aren't counted in the `contact.merged` payload. Real email delivery waits for the domain (§19; dev prints to the console, pitfall 9). The contact page loader calls 9 server functions since step 5 (§17 pitfall 15) |
| Shared line rules (step 5) | Line, tax and day rules now live in `src/modules/documents/lines.ts` (below); `QUOTE_LIMITS`' line limits, `quoteLineSchema` and `quoteTotals` are aliases of them, and the product check is `assertLineProducts`. `QuoteEditor` and `QuoteDocument` are still the quote's own components |

Tests: `tests/unit/quotes.test.ts` (9: expiry after the valid-until day, other statuses never expire, 30-day default at 12:00 UTC, totals with tax rounded once and too-large totals refused, line rules, from a deal or a contact, tax range and 100 lines, `QUO-0001` labels, the email in the quote's language with escaped client text) and `tests/integration/quotes.test.ts` (7: per-workspace numbers and language from the contact; server totals and active catalog products; send/accept/decline/reopen only from the right status, once; expired can't be accepted and email needs an address; from a deal with contact, company and the returned deal; merging moves quotes, tags and notes on quotes; no reach across workspaces); the workspace-deletion test in `isolation.test.ts` covers `quote`. The integration tests wait for a recreated `test` branch.

### Orders and invoices (`Built`, phase 2 step 5)
**Built:** `src/modules/orders` (`schema.ts`: `ORDER_STATUSES`, `ORDER_ACTIONS`, `ORDER_TRANSITIONS`, input and search schemas; `orders.server.ts`: data layer; `orders.ts`: server functions `listOrders`, `getOrder`, `createOrder`, `updateOrder`, `changeOrderStatus`, `archiveOrder`, `restoreOrder`, `listRelatedOrders`; `components/orderBits.ts`), `src/modules/invoices` (`schema.ts`: `INVOICE_STATUSES`, `INVOICE_DISPLAY_STATUSES`, `INVOICE_LIMITS`, `invoiceDisplayStatus`, `invoiceLabel`, input and search schemas; `invoices.server.ts`; `invoices.ts`: `listInvoices`, `getInvoice`, `createInvoice`, `updateInvoice`, `issueInvoice`, `voidInvoice`, `sendInvoice`, `archiveInvoice`, `restoreInvoice`, `listRelatedInvoices`; `components/invoiceBits.ts`) and the shared `src/modules/documents` (`lines.ts`: `DOCUMENT_LIMITS`, `documentLineSchema`, `documentLinesSchema`, `documentTotals`, `taxRateSchema`, `optionalDaySchema`, `utcDay`, `dayToStored`; `lines.server.ts`: `assertLineProducts`; `document-email.server.ts`: `documentEmail`; `components/`: `DraftEditor`, `DocumentView` (the printable document in the document's language), `DocumentBits` (`DocumentStatusBadge`, `RelatedDocuments` card), `NewDocumentDialog`). Routes `/orders`, `/orders/$orderId`, `/invoices`, `/invoices/$invoiceId` in EN/ES. Migrations `0010_orders_invoices_on_contacts` and `0011_drop_customer_from_orders` (destructive) were applied to dev before #26 was merged.

Removed: `src/lib/orders.ts`, `src/lib/invoices.ts`, `src/components/Orders/OrderEditor.tsx`, the old order and invoice routes (including `/orders/new`), the old order/invoice Zod schemas in `src/lib/schema.ts` and their unit tests, `scripts/seed-sales.ts` and its `db:seed:sales` script. Old customers can now be deleted without the "has orders" check, because orders no longer point to them. The task/activity order picker (`getWorkspaceRefOptions` in `src/lib/tasks.ts`) showed the order's contact until phase 3 steps 2–3 replaced it with the record picker (below).

| Topic | Rule |
|---|---|
| Permissions | `order` statement: owner/admin create, read, update, delete; editor create, read, update (confirming, fulfilling, cancelling and "Back to draft" are `update`); viewer read. `invoice` statement: owner/admin create, read, update, delete, issue, pay, void; editor create, read, update (drafts only); viewer read. Issuing **and emailing** need `invoice:issue`, voiding `invoice:void` (owner/admin); archiving and restoring need `delete`. `pay` confirms, rejects and reverses payments (step 6, below) |
| Creating an order | From a contact or a deal (the deal's contact and company come along; otherwise the contact's company): an empty draft, language from the contact, currency and default tax from the workspace, owner = the creating member. From an **accepted** quote ("Create order" on the quote page): contact, company, deal, language, currency, tax, notes, totals and lines copied; event `quote.ordered` on the quote. **One order per quote** (check before, partial unique index as the backstop → 409). Numbered `ORD-0001` at once |
| Order statuses | draft → confirmed (needs ≥ 1 line) → fulfilled; cancel from draft or confirmed; "Back to draft" from confirmed. Cancel and "Back to draft" are refused (409) while the order has an invoice that isn't void. Only drafts are edited: contact, company, owner, language, tax, order date, notes, the whole ordered line list and custom fields |
| Creating an invoice | Direct for a contact or a deal (as for orders), or from a **confirmed or fulfilled** order ("Create invoice" on the order page: contact, company, deal, language, currency, tax, notes and lines copied; event `order.invoiced` on the order). **One invoice per order that isn't void** (partial unique index → 409); voiding it frees the order (§3) |
| Invoice statuses | draft (no number) → issued → void; void also from draft; issued, partially paid and paid follow the confirmed payments (step 6, below). **Issuing** needs ≥ 1 line, takes the next number of the current year's series (`INV-2026-0001`, `workspace_counter` kind `invoice`), sets the issue date to today and the due date to today + the workspace's payment terms (`paymentTermsDays`, default 30), at 12:00 UTC; afterwards the invoice never changes. A zero total can't be issued (400: it could never be paid and would stay overdue forever). **Overdue** = issued or partially paid and past its due day, worked out on read (`invoiceDisplayStatus`, and the same condition in SQL for the list's status filter; §17 pitfall 17). Only void invoices and drafts that don't come from an order can be archived (an issued, partially paid or paid invoice is a record; a draft of an order is voided instead, §3). An invoice with reported or confirmed payments can't be voided (409: reject or reverse them first, §3), checked before and again inside the batch |
| Drafts | A draft created from an order keeps the order's contact, company, lines and tax (owner decision, §3): the server saves only language, owner, notes and custom fields (`updateOrderDraft`, event payload `fromOrder: true`), and `DraftEditor` has a `locked` mode (the contact named, tax disabled, lines hidden). Other drafts: one `db.batch` saves the fields and the whole line list (deleted and re-inserted); the server recomputes line totals, subtotal, tax (rounded once) and total. Shared limits (`DOCUMENT_LIMITS`): 100 lines, quantity 1–1,000,000, every amount ≤ 2,000,000,000 cents, tax 0–10,000 bp, notes ≤ 2,000; dates must be real days. Contact, company and owner checked when set or changed; catalog lines through `assertLineProducts` (this workspace's products; newly added ones active); custom values through `prepareCustom` |
| Sending an invoice | Issued and partially paid invoices only; needs the contact's email. The email is the full invoice (lines, totals, due date, notes) in the invoice's language, every value escaped, `reply_to` the sending member. `sent_at` and `invoice.sent` are saved first; if the email then fails the answer is 502. Caps (`INVOICE_LIMITS`, counted from `invoice.sent` events): 50 per workspace in 24 hours, 5 per invoice (429) |
| Concurrency | Every edit, status change, archive and restore locks the row (`SELECT … FOR UPDATE`) and guards its status (and not archived) inside the batch; a failed guard divides by zero → 409 "changed meanwhile". The order guard for cancel and "Back to draft" also checks there is no non-void invoice; issuing and sending an invoice also check it is exactly the version that was read (`updated_at`). The invoice number is taken just before the batch, so only a lost race leaves a gap. Issuing takes the invoice number inside the same batch (the `workspace_counter` upsert, then `number = (select …)`), so a failed or double-clicked Issue rolls the counter back: issued numbers have no gaps, and the counter row lock serialises concurrent issues. Creating an invoice from an order locks the order and guards that it is still confirmed/fulfilled and active; creating an order from a quote locks the quote and guards that it is still accepted and active; confirming guards that the order still has lines |
| Events | `order.created` (`number`, `dealId` or `quoteId`), `order.updated` (`lines`, `totalCents`, `custom` when custom values changed; same for `invoice.updated`), `order.confirmed`, `order.fulfilled`, `order.cancelled`, `order.reopened`, `order.invoiced` (`invoiceId`), `order.archived`, `order.restored`; `invoice.created` (`dealId` or `orderId`), `invoice.updated`, `invoice.issued` (`number`, `totalCents`), `invoice.sent`, `invoice.voided`, `invoice.archived`, `invoice.restored`; each in the same `db.batch` as the change |
| Lists | `/orders` and `/invoices`: saved views and filters (§7.3); search by number (`ORD-12`, `12`; invoices only the full `INV-2026-1` form), contact, company (and deal for orders); status filter (invoices include overdue); active or archived |
| Record pages | `/orders/$orderId` and `/invoices/$invoiceId`: the shared `DraftEditor` for drafts (catalog picker and free-text lines, live totals), the printable `DocumentView` in the document's language with "Print / Save as PDF", actions by status, related documents, tags, notes, custom fields, timeline |
| Contact, deal and quote pages | Contact and deal pages show Orders and Invoices cards with "New order" / "New invoice"; the quote page shows its orders and "Create order" when accepted |
| Merge | `mergeContacts` moves the duplicate's orders and invoices to the kept contact inside its batch |
| Shared engine | `order` and `invoice` are in `OBJECT_KEYS` (custom fields with "Orders" and "Invoices" tabs, saved views) and `SUBJECT_TYPES` (tags, notes, timeline) |
| Known limits | Orders and invoices moved by a merge get no event and aren't counted in the `contact.merged` payload. Real email delivery waits for the domain (§19). The contact page loader calls 9 server functions (§17 pitfall 15). A draft invoice of an order can't be archived (void it instead), so it never blocks its order. Two people saving the same draft at once: the last save wins (as for quotes). The 50-a-day email cap can be slightly exceeded by parallel sends of different invoices. Migration `0010` deletes every order and invoice: dev only, never run it on a database with real orders |

Tests: `tests/unit/billing-documents.test.ts` (10: totals with tax rounded once and too-large refused, line rules, real days; order transitions, order sources, draft tax and order date; `INV-2026-0001` labels, overdue, invoice sources; the document email in its language with escaped values) and `tests/integration/orders-invoices.test.ts` (7: order from an accepted quote with lines copied, once per quote; draft → confirmed → fulfilled, cancel and reopen refused once invoiced; direct drafts issued in the year's series, due after the terms, then frozen; emailing needs an issued invoice and an address; merging moves orders and invoices; no reach across workspaces); the workspace-deletion test in `isolation.test.ts` now also covers `order_line` and `invoice` (`sales_order` was already in it; `invoice_line` is not checked yet). They passed on the recreated `test` branch before #26 was merged (91 integration tests in total).

### Payments (`Built`, phase 2 step 6)
**Built:** `src/modules/payments` (`schema.ts`: `PAYMENT_METHODS`, `PAYMENT_STATUSES` and their labels, `recordPaymentSchema`, `decidePaymentSchema`, `paidStatus`; `payments.server.ts`: data layer; `payments.ts`: server functions `listPayments`, `recordPayment`, `decidePayment`; `components/PaymentsCard.tsx`). No page of its own: payments live on the invoice page. Migration `0012_payments` (additive: the `payment` table and `invoice.paid_cents`, plus `invoice.order_id` changed from restrict to no action) was applied to dev on 2026-11-03 and verified (the `payment` table, `invoice.paid_cents`, both foreign keys now no action; row counts unchanged).

| Topic | Rule |
|---|---|
| Permissions | Listing needs `invoice:read`; recording needs `invoice:update` (editors too); confirming, rejecting and reversing need `invoice:pay` (owner/admin). Whether a new payment is confirmed at once is decided on the server with `hasPermission(invoice:pay)`, never sent by the browser (owner decision, §3) |
| Recording | Only on issued, partially paid or paid invoices that aren't archived. Amount 1–2,000,000,000 cents; paid-on a real day, not in the future (one day of slack for time zones east of UTC); method bank transfer, cash, card or other; reference ≤ 100, note ≤ 500. An owner's or admin's payment is `confirmed` at once, an editor's is `reported` (waiting) |
| Overpayment | Confirmed + reported + the new amount must not exceed the total. Checked inside the batch, so two payments at once can't together pass it (409 "changed meanwhile", or 400 "too much" when the amount itself doesn't fit) |
| Deciding | Confirm: reported → confirmed. Reject: reported → rejected. Reverse: confirmed → rejected (it stops counting). An optional reason (≤ 500) is stored as `reject_reason`. All through `decidePayment` (`decision` `confirm`/`reject`) |
| Invoice state | Every write locks the invoice row (`SELECT … FOR UPDATE`), guards the payment's and the invoice's status inside the batch (a failed guard divides by zero → 409), and recomputes `paid_cents`, the status (issued / partially paid / paid) and `paid_at` from the confirmed payments in the same `db.batch`. Payment statuses are bound as parameters, never `sql.raw` |
| Events | `invoice.payment_recorded` (an editor's, waiting), `invoice.payment_confirmed` (an owner's/admin's at once, or a waiting one confirmed), `invoice.payment_rejected` (reject or reverse, with `reason`); payload `paymentId`, `amountCents` (and `method` when recorded); shown on the invoice's timeline |
| Voiding | Refused while the invoice has reported or confirmed payments (above); credit notes later |
| Invoice page | A Payments card once issued (not on drafts or void invoices): paid, waiting and balance; the list with date, amount, method, reference, status and note or reason; "Record payment" (amount defaults to the open balance after waiting payments, date to today's local date); Confirm and Reject on waiting payments and Reverse on confirmed ones for owners and admins. "Partially paid" and "Paid" have their own labels and badge tones |
| Portal | Customer-reported payments (phase 4) will be `source` `portal` and `reported`, in the same queue (§3, §8) |
| Receipts | "Attach receipt" on each payment stores a file on the invoice that names the payment (phase 3 step 4, §9); the timeline reads "Receipt added" |
| Known limits | Payments aren't listed outside their invoice yet (no Sales → Payments page; receivables come with the dashboards). The workspace-deletion test in `isolation.test.ts` doesn't check `payment` yet |

Tests: `tests/unit/payments.test.ts` (3: issued / partially paid / paid from the confirmed sum; amount, method and day rules; a partially paid invoice past due is overdue, a paid one never) and `tests/integration/payments.test.ts` (4: partial then full with a waiting payment, confirming, overpayment and voiding refused, reversing, and the events; two payments at once can't exceed the total; drafts from an order stay locked; no reach across workspaces). The integration tests wait for a recreated `test` branch.

### Projects (`Built`, phase 3 step 1)
**Built:** `src/modules/projects` (`schema.ts`: `PROJECT_STATUSES`, `PROJECT_STATUS_LABELS`, `projectInputSchema`, `updateProjectSchema`, `projectFromDealSchema`, `projectSearchSchema`, `relatedProjectsSchema`; `projects.server.ts`: data layer; `projects.ts`: server functions `listProjects`, `getProject`, `createProject`, `createProjectFromDeal`, `updateProject`, `archiveProject`, `restoreProject`, `listRelatedProjects`; `components/`: `ProjectFormDialog`, `ProjectBits` (`projectStatus`, `RelatedProjects` card)) and the routes `/projects` (`src/routes/_authed/projects/index.tsx`) and `/projects/$projectId`, in EN/ES. Migration `0014_projects` (additive: 9 columns, 4 foreign keys, 4 indexes; the 4 demo projects in dev become `planned`) was applied to dev on 2026-11-03. Removed: `src/lib/projects.ts` and the old `src/routes/_authed/projects.tsx`.

| Topic | Rule |
|---|---|
| Permissions | `project` statement (unchanged): owner/admin create, read, update, delete; editor create, read, update; viewer read. Archiving and restoring need `delete`; "Create project" on a deal needs `project:create` |
| Values | Name 1–120; description ≤ 2,000; status `planned`/`active`/`on_hold`/`completed`/`cancelled`, freely chosen in the form; start and due dates are real days, stored all-day at 12:00 UTC, due not before start; contact, company and owner optional. Contact and company must be active and of the workspace, owner a current member, checked when set or changed (an unchanged archived link doesn't block an edit); custom values through `prepareCustom`. An archived project can't be edited (409) |
| Create project from a deal | A **"Create project"** button on a **won**, non-archived deal without an active project (owner decision, §3; automatic creation comes with workflows, phase 7). The project takes the deal's name, owner, contact and company, `deal_id` = the deal, status `planned`, and the page opens it. **One active project per deal**, enforced by the partial unique index `project_workspace_deal_active_unique` on `(workspace_id, deal_id)` where the project is active (so restoring an archived project of a deal that has another active one is refused, 409): checked before, then inside the `db.batch` the deal row is locked (`SELECT … FOR UPDATE`) and a guard divides by zero unless the deal is still won and active and has no active project, so two clicks at once create one project (409) |
| Events | `project.created` (payload `dealId` when made from a deal), `project.updated` (`changes`; custom fields as `custom.<key>`), `project.status_changed` (`from`, `to`, `changes`; written instead of `project.updated` when the status changes), `project.archived`, `project.restored`, each in the same `db.batch` as the change. Timeline: "Status changed to X" |
| List | `/projects`: saved views and filters (§7.3), search over the project name and its contact and company, status filter, active or archived |
| Project page | `/projects/$projectId`: status, dates, owner, contact, company, source deal, description, edit, archive/restore, tags, notes, custom fields, timeline |
| Contact, company and deal pages | A Projects card lists their active projects (at most 50) |
| Timelines | The contact's and the deal's timelines also show the project's milestone events (created, status changed, archived, restored) with a link named after the project (§11.2) |
| Merge | `mergeContacts` moves the duplicate's projects to the kept contact inside its batch |
| Shared engine | `project` is in `OBJECT_KEYS` (custom fields with a "Projects" tab in Settings → Fields, saved views) and `SUBJECT_TYPES` (tags, notes, timeline) |
| Known limits | Edits are check-then-write without a row lock (as for contacts): an edit can land on a project archived at the same moment. Archive and restore lock the row and re-check its state in the batch, so two at once write one event. A project made with "Create project" gets no custom-field values, so a required project field isn't enforced on that path (as for orders made from quotes); it is on edit. Projects moved by a merge get no event and aren't counted in the `contact.merged` payload. The contact page loader now calls 10 server functions (11 since steps 2–3; §17 pitfall 15). Tasks, activities and milestones on projects: steps 2–3 (below); files: step 4 (§9) |

Tests: `tests/unit/projects.test.ts` (3: name required with optional contact and company; due not before start and real days; fixed statuses and safe list-search defaults) and `tests/integration/projects.test.ts` (4: create and edit with a separate status event; a won deal becomes a project once, with its name, contact and company, also with two requests at once, and on the deal's timeline; merging contacts moves projects; no reach across workspaces); the workspace-deletion test in `isolation.test.ts` covers `project`. The integration tests wait for a recreated `test` branch.

### Tasks, activities and calendar (`Built`, phase 3 steps 2–3)
**Built:** `src/modules/tasks` (`schema.ts`: `TASK_STATUSES`, `TASK_PRIORITIES`, `ACTIVITY_TYPES`, `WORK_SUBJECT_TYPES` and their labels, input, board, calendar and picker schemas; `tasks.server.ts`: data layer; `tasks.ts`: server functions `listTasks`, `createTask`, `updateTask`, `moveTask`, `deleteTask`, `createActivity`, `updateActivity`, `deleteActivity`, `listCalendar`, `listRecordWork`, `getWorkOptions`, `searchWorkSubjects`; `calendar.ts`: day helpers, moved from `src/lib/calendar.ts`; `components/`: `TaskBoard`, `CalendarBoard`, `TaskFormDialog`, `ActivityFormDialog`, `SubjectPicker`, `RecordWork`, `WorkBits`) and the routes `/tasks` and `/calendar`, rebuilt in EN/ES. Steps 2 and 3 were built in one PR (owner decision, §3). Migrations `0015_tasks_subjects` (additive) and `0016_drop_customers` (destructive; drizzle generated `DROP TABLE … CASCADE` first, reordered by hand to drop the foreign keys, `activity_workspace_customer_idx` and the columns before the table) were applied to dev on 2026-11-04 with the owner's approval and verified: 17 migrations recorded, `customer` gone, the new columns and 4 indexes present, the 7 tasks and 4 activities kept (dev had 5 demo customers, deleted, and no task or activity linked to a customer or an order). The `test` branch was recreated afterwards.

Removed: the `customer` table, `src/lib/customers.ts`, `src/lib/tasks.ts`, `src/lib/activities.ts`, `src/components/Customers/*`, `src/components/Tasks/*`, the `/customers` route and nav entry, the `customer` permission resource and the `createCustomer`/`updateCustomer`/`deleteCustomer` flags of `getWorkspaceAccess`, `assertWorkspaceRefs`' customer check, `scripts/seed-customers.ts` and `db:seed:customers`. `CUSTOMER_PAGE_SIZES` is now `PAGE_SIZES` (`src/lib/schema.ts`).

| Topic | Rule |
|---|---|
| Permissions | `task` and `activity` statements (unchanged): owner/admin create, read, update, delete; editor create, read, update; viewer read. Moving a task on the board is `task:update`; the calendar and the record card need `task:read` and `activity:read`; the record picker and the form options need `task:read` |
| Links | Each task or activity is about **one record** (`subject_type` + `subject_id`: contact, company, deal, quote, order or invoice), plus an **optional project** (owner decision, §3). Type and id come as a pair. When set or changed, the record must be an active record of the workspace and the project an active project of the workspace (400 otherwise); an unchanged link to a record archived since doesn't block an edit |
| Values | Task: title 1–200, description ≤ 5,000, status `backlog`/`todo`/`in_progress`/`review`/`done`, priority `low`/`medium`/`high`/`urgent`, assignee (a current member when set or changed), due date (all-day or timed); `is_milestone` needs a project. Activity: type `call`/`meeting`/`email`/`follow_up`, subject 1–200, notes ≤ 5,000, start, optional end not before the start, all-day or timed, owner, completed flag. All-day times at 12:00 UTC |
| Board | `/tasks`: one column per status with drag and drop; filters search, assignee, priority, project and "due within N days" (overdue included; saved per person, §3); at most 500 tasks. Moving renumbers the target column in one `UPDATE` statement, then moves the card |
| Calendar | `/calendar`: day, "N days" (1–14, saved per person), week and month views of tasks by due date and activities by start; at most 500 tasks and 500 activities per range |
| Forms | A record picker (choose the type, then search its active records; up to 10 results) and a project select; from a record or project page the form opens prefilled with it |
| Record pages | A **"Tasks and activities"** card (`RecordWork`) on contact, company, deal, quote, order, invoice and project pages: open tasks plus those done in the last 30 days, and the latest 30 activities. Since phase 3 step 4 it sits full width after the timeline card, followed by the Files card (#30 had nested it inside the timeline card); on the company page both are in its card column |
| Events | `task.created`, `task.updated`, `task.completed`, `task.reopened`, `task.deleted`; `activity.created`, `activity.updated`, `activity.completed`, `activity.deleted` (subject type `task` / `activity`), each in the same `db.batch` as the change. Tasks and activities are **hard-deleted**; the `*.deleted` event is the trace |
| Timelines | A record's timeline shows `task.created`, `task.completed`, `activity.created` and `activity.completed` of the tasks and activities about it; a project's timeline shows its milestone tasks and its activities (§11.2) |
| Merge | `mergeContacts` moves the duplicate's tasks and activities to the kept contact inside its batch |
| Dashboard | `/dashboard` (`src/lib/dashboard.ts`, `getDashboardStats`) now counts active contacts by lifecycle stage, new contacts in the last 30 days against the previous 30, contacts per month and the share of customers; companies by country; members, projects and invitations. Needs `contact`, `company` and `project` read. The page and its chart components are in EN/ES |
| Not included | Custom fields, saved views and tags on tasks and activities: they need a table view (a later step, suggested) |
| Known limits (security review: no critical/high) | (M1) Record-page loaders call one more server function (the contact page 11): measure subrequests per page before the Workers deploy and add a cookie cache or fold calls if needed (§17 pitfall 15). (L1) The record picker, the record card and the timeline assume every role that reads tasks also reads every record type (true for the four roles); custom roles and the portal need per-type checks. (L2) `moveTask`'s column renumber runs before the move's batch, so two drops into a crowded column at once can misorder cards (no data leak). (L3) Board and calendar return at most 500 rows each. Edits are check-then-write without a row lock, as for contacts |

Tests: `tests/unit/tasks.test.ts` (5) and `tests/integration/tasks.test.ts` (6); the workspace-deletion test in `isolation.test.ts` covers `task` and `activity`, and `assertWorkspaceRefs` is tested without customers. `bun run validate` passes (112 unit tests, 1,272 i18n keys); 107 integration tests pass on the recreated `test` branch.

### Navigation (staff app)
Home (dashboard `Built`) · **Contacts** (Contacts, Companies, custom objects) · **Sales** (Deals `Built`,
Quotes `Built`, Orders `Built`, Invoices `Built`, Payments (`Built` on the invoice page; no list page yet), Products `Built`) · **Work** (Projects `Built`, Tasks `Built`,
Calendar `Built`, Files `Built`; the sidebar still shows Tasks and Calendar in a separate "Planning" group) · **Service** (Tickets, Knowledge base, Surveys) ·
**Marketing** (Campaigns, Segments) · **Automation** (Workflows) ·
**Settings** (Workspace, Members, Fields & objects, Pipelines, Templates,
Portal, Email, Limits). Modules switched off are hidden.

## 11. Events, timeline and workflows `Planned`

### 11.1 Event log (`Built` for contacts, companies, deals, products, quotes, orders, invoices, payments, projects, tasks, activities, files and folders)
**Built:** `src/platform/events.server.ts`: `eventInsert(workspaceId, actor, …)` returns the insert to put in the same `db.batch` as the change; `changedFields(before, after)` produces `{ field: { from, to } }` for `*.updated` events (saving without changes writes no event). Types so far: `<record>.created|updated|archived|restored|tag_added|tag_removed|note_added|note_edited|note_pinned|note_unpinned|note_deleted` for contacts and companies, plus `pipeline.created|updated|archived|restored` (§10), `deal.created|updated|stage_changed|won|lost|reopened|archived|restored` and the tag and note events on deals (§10), `product.created|updated|archived|restored` (§10; `updated` carries `changes`), `quote.created|updated|sent|accepted|declined|reopened|archived|restored|ordered` and the tag and note events on quotes (§10), `order.created|updated|confirmed|fulfilled|cancelled|reopened|invoiced|archived|restored` and `invoice.created|updated|issued|sent|voided|archived|restored`, with the tag and note events on both (§10), `invoice.payment_recorded|payment_confirmed|payment_rejected` on the invoice (payload `paymentId`, `amountCents`, `method` or `reason`; §10), `project.created|updated|status_changed|archived|restored` and the tag and note events on projects (§10), `task.created|updated|completed|reopened|deleted` and `activity.created|updated|completed|deleted` (subject type `task` / `activity`; tasks and activities are hard-deleted, so `*.deleted` is the trace; §10), `<record>.file_added|file_deleted|file_shared|file_unshared` on the record a file belongs to (payload `fileId`, `name`, `paymentId` for receipts), `file.file_added|file_deleted` for workspace files and `folder.created|renamed|moved|deleted` (§9), `contact.merged` on both merged contacts (payload `role` `kept`/`duplicate`, `otherId`, `otherName`, `notesMoved`, `tagsMoved`, `dealsMoved`; the kept one adds `taken` and `changes`, the duplicate `cleared`, the unique values it gave up; §10); records created by a CSV import (§10) carry payload `{ source: "import" }` on their `*.created` event (and on the events of companies the import creates). **Known limits (security review, phase 1 step 1):** update events keep the old and new values of changed fields, including email and phone, so erasing a person (§12.4) must also scrub their events; an edit and an archive sent at the same moment can both pass their checks, so an update can land on a just-archived record (rare, harmless, revisit if workflows make it likely).

`event`: `workspace_id`, `type` (e.g. `contact.created`, `deal.stage_changed`,
`invoice.payment_confirmed`, `ticket.closed`), `subject_type` + `subject_id`,
`actor` (member, contact, system or workflow), `payload` (before/after of
changed fields), `created_at`. Written in the same `db.batch` as the change, so
the log never disagrees with the data. Append-only.

### 11.2 Timeline (`Built` for contacts, companies, deals, quotes, orders, invoices and projects, with their tasks, activities and files)
**Built:** `src/modules/records` (tags, notes, timeline for any record type in `SUBJECT_TYPES`). The page shows tags, then notes and events newest first with pinned notes on top, filterable All / Notes / Changes. `*.note_added` and `*.note_edited` events stay in the log but aren't shown (the note itself is). `contact.merged` reads "Merged X into this contact" or "Merged into X"; deal events read "Moved to X", "Marked as won", "Marked as lost: reason" and "Reopened"; quote events read "Emailed to the contact" or "Marked as sent", "Accepted", "Declined: reason", "Back to draft" and "Edited the draft", plus "Became an order" for `quote.ordered`; order events read "Confirmed", "Fulfilled", "Cancelled", "Invoiced" and "Back to draft"; invoice events read "Issued", "Emailed to the contact" and "Voided", and payment events "Payment recorded, waiting for confirmation", "Payment confirmed" and "Payment rejected: reason" (`*.updated` on quotes, orders and invoices share "Edited the draft"); `project.status_changed` reads "Status changed to X". **Across the sales chain (phase 2 step 7, no migration):** `getTimeline` (`src/modules/records/records.server.ts`) also returns, for a contact, the milestone events of its deals, quotes, orders and invoices, and for a deal, those of its quotes, orders and invoices (linked by `contact_id` / `deal_id`, each subquery filtered by the session's workspace). Milestones are every event except `*.updated`, `*.tag_*`, `*.note_*` and (since phase 3 step 4) `*.file_*`: routine edits, tags and notes stay on the related record's own page. Each row carries `subjectType`/`subjectId` and, from workspace-filtered subqueries, `relatedName` (the deal's name), `relatedNumber` and `relatedYear` (invoices), so `RecordTimeline` puts a link to the related record before the description ("QUO-0001: Accepted", "INV-2026-0001: Payment confirmed"; a draft invoice without a number shows the draft label). Still at most 200 events per timeline, one query. **Projects (phase 3 step 1):** the contact's and the deal's timelines also take the milestones of their projects (by `contact_id` / `deal_id`), with `relatedName` the project's name and a link to `/projects/$projectId`. **Tasks and activities (phase 3 steps 2–3):** a record's timeline (contact, company, deal, quote, order, invoice) also shows `task.created`, `task.completed`, `activity.created` and `activity.completed` of the tasks and activities about it (by `subject_type`/`subject_id`); a project's timeline shows its milestone tasks and its activities (by `project_id`); every subquery filters by the session's workspace. **Files (phase 3 step 4):** a record's own file events read "File added: name", "File deleted: name", "File shared with the customer: name", "File no longer shared: name" and "Receipt added: name" (when a payment is named); they don't reach related records' timelines, because the milestone filter also excludes `%.file\_%`. These rely on every role that reads the record also reading tasks and activities (true for the four roles; per-type checks needed with custom roles and the portal, §10). Permissions: reading follows the record's `read`; tagging, adding notes and pinning need its `update`; only the author edits a note's text; authors or owners/admins (`delete`) delete notes. Checked inside each server function with `assertPermission` (`src/platform/permissions.server.ts`) under the `requireWorkspace` middleware, the pattern custom objects will reuse (§7.4). Security review (step 7): no critical/high. Each related branch uses `subject_id = any(array(select …))`, computed once, so the event index on `(workspace_id, subject_type, subject_id)` serves it (a plain `IN` subquery under `OR` would re-check every event); migration `0013` adds `invoice (workspace_id, deal_id)` for the deal timeline and the deal page (additive, applied to dev on 2026-11-03). The milestone filter escapes `_` in its `LIKE` patterns. Known limits: related events share the 200-event limit with the record's own (no paging yet); a record moved to another contact (or by a merge) takes its whole history with it. Every role that reads contacts also reads deals, quotes, orders, invoices and projects; a future custom role without one of them must have those related events filtered out in `relatedEvents`.

Every record page shows its events, notes, emails, tasks, activities, files and
related records' key events, newest first, filterable by kind. (Built so far:
events, notes, related records' key events on contacts and deals, and tasks,
activities and files on every record page; emails come with their phase.)

### 11.3 Workflows
- **Trigger:** an event type (optionally filtered), or a schedule / a date field ("30 days before *End date*").
- **Conditions:** field comparisons on the subject record (AND/OR, one level in v1).
- **Actions:** create task, send email from a template, update a field, change stage, add tag, notify a member, create a record, send a survey.
- **Execution:** events are pushed to a **Cloudflare Queue**; a consumer evaluates workflows and records each `workflow_run` (status, steps, error). Scheduled triggers come from a Cron Trigger.
- **Safety:** events caused by a workflow don't re-trigger the same workflow; maximum chain depth 3; per-workspace run limit; a failing workflow is paused after repeated errors and the admin is notified.

## 12. Multi-tenancy, security and limits `Planned`

### 12.1 Rules that must never break
1. **Workspace isolation:** every query filters by `workspace_id` from the session, never from input; every referenced id is checked against the workspace.
2. **Contact isolation (portal):** every portal query also filters by the contact scope, and returns only portal-visible fields, objects and files.
3. **Permissions:** every server function has `requirePermission` or `requireObjectPermission`; the UI only hides.
4. **Validation:** Zod on every input; custom-field values validated against their definitions on the server.
5. **Server-only code** stays in `*.server.ts`; `check:bundle` guards the browser bundle.
6. **Secrets:** never in code, logs or the browser; per-workspace partner credentials encrypted at rest.

### 12.2 Roles (carried, extended)
Owner, admin, editor, viewer. Settings (fields, objects, pipelines, templates,
workflows, portal, limits) are owner/admin only. Payments: confirming is
admin+; editors can record (`Built`, below). Custom roles: `Later`.
**Built:** references are checked when set or changed: an unchanged owner who left the workspace, or an unchanged link to an archived company, doesn't block editing; new links need a current member and an active company. Custom field definitions (`field` permission): owner/admin create/update/delete, every role reads. Contacts and companies: owner/admin full; editor create, read, update; viewer read. Archiving and restoring need `delete` (owner/admin). CSV export needs `read`; CSV import needs `create`, plus `update` when it updates existing records (§10). Merging contacts needs `update` and `delete` (owner/admin); finding merge candidates needs `read` (§10). Pipelines and stages (`pipeline` permission): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor and viewer read (§10). Deals (`deal` permission): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor create, read, update; viewer read; the deal form's contact picker needs `contact:read` (§10). Products (`product` permission, unchanged): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor create, read, update; viewer read; the document line picker needs `read` (§10). Quotes (`quote` permission): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor create, read, update, which includes sending, accepting, declining and "Back to draft"; viewer read; "Mark deal won" after accepting is the deal's own `moveDeal` and needs `deal:update` (§10). Orders (`order` permission): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor create, read, update, which includes confirming, fulfilling, cancelling and "Back to draft"; viewer read; "Create order" from a quote needs `order:create` (§10). Invoices (`invoice` permission): owner/admin create, read, update, delete, issue, pay, void; editor create, read, update (draft invoices); viewer read; issuing and emailing need `issue`, voiding `void`, archiving and restoring `delete` (§10). Payments (phase 2 step 6): listing needs `invoice:read`, recording `invoice:update` (an editor's payment waits as reported; an owner's or admin's, who also hold `pay`, is confirmed at once, decided on the server); confirming, rejecting and reversing need `invoice:pay` (§10). Projects (`project` permission, unchanged, phase 3 step 1): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor create, read, update; viewer read; "Create project" on a won deal needs `project:create` (§10). Tasks and activities (`task`/`activity` permissions, unchanged, phase 3 steps 2–3): owner/admin create, read, update, delete; editor create, read, update; viewer read; the calendar and the record card need both reads (§10). The old `customer` permission is gone. The dashboard needs `contact`, `company` and `project` read. Files (`Built`, phase 3 step 4, owner decision §3): record files follow the record (`read` to see and download, `update` to upload and share, `delete` or being the uploader with `update` while the record isn't archived to delete); workspace folders and their files use the new `file` permission (owner/admin create, read, update, delete; editor create, read, update; viewer read) (§9).

### 12.3 Limits per workspace (initial defaults)
| Resource | Default |
|---|---|
| Contacts + companies | 10,000 |
| Custom records (all objects) | 20,000 |
| File storage / max file size | 1 GB / 25 MB (`Built` as `FILE_LIMITS`, §9) |
| Transactional emails per day | 200 |
| Campaign emails per month | 1,000 |
| Workflow runs per day | 1,000 |
| AI requests per month | 200 |
| Portal users | 500 |

Stored in `workspace_limit` (overridable by hand), counted in `workspace_usage`;
exceeding a limit returns a clear message, never a silent failure. These become
plan boundaries if billing is ever added.

### 12.4 Privacy
Contact export (JSON/CSV) and deletion on request; email consent recorded with
source and date; unsubscribe always honored; workspace deletion removes database
rows and R2 files (files `Built`: `afterDeleteOrganization` → `deleteWorkspaceObjects`, §9).

## 13. AI business support `Planned`

- **First version:** summarize a contact/company/project/ticket history; draft an email or ticket reply in the contact's language; suggest KB articles for a ticket; draft a KB article from resolved tickets.
- **Later:** questions about workspace data ("which deals stalled this month?"), ticket auto-categorizing, lead scoring.
- **Rules:** the server collects only data the requesting member is allowed to see, from the current workspace; nothing from other workspaces ever reaches a prompt. Workspace owners can switch AI off. Every request counts toward the limit and is logged (who, feature, tokens), without storing prompt content longer than needed.
- **Provider:** Claude API through a small adapter; the model is chosen when phase 9 starts.

## 14. Internationalization (EN/ES) `Planned` (foundation `Built`, see §5)

- **Interface:** every string in `messages/en` and `messages/es`; no hard-coded text (a check in `validate` fails on missing keys).
- **Who picks:** members choose their language; contacts have `locale`; the workspace has a default.
- **How it is detected (built):** the `PARAGLIDE_LOCALE` cookie, then the browser's `Accept-Language`, then English; no locale in the URL. Phase 1 makes the member's saved preference set the cookie at sign-in, and the portal use the contact's `locale`.
- **Content written by the business:** field labels, options, KB articles, email/survey/campaign templates, portal texts are stored as `{ en, es }`; missing translations fall back to the workspace default.
- **Formatting:** dates, numbers and currency through `Intl` with the reader's locale and the workspace's currency and time zone.
- **Documents:** quotes and invoices render in the contact's language, as a printable page ("Print / Save as PDF" in the browser), not a generated PDF (owner decision 2026-11-03, §3). **Built for quotes:** a quote stores its `locale` (taken from the contact when created, changeable on the draft); the printable document and the quote email use that language whatever the reader's, through `m.*({}, { locale })`. **Built for orders and invoices** (phase 2 step 5) the same way: `locale` from the contact (or copied from the quote / order), changeable on the draft; the shared `DocumentView` and `documentEmail` render in it.
- **Input in either language (built, CSV import):** a Paraglide message function accepts `{ locale }` (`m.stage_lead({}, { locale: "es" })`), so labels such as `STAGE_LABELS` and `CONSENT_LABELS` are typed as message functions (`typeof m.stage_lead`), not `() => string`, and imported values are recognised in English and Spanish whatever the importer's language.

## 15. Partner services

| Need | Partner | When |
|---|---|---|
| Email (transactional, campaigns) | Resend | Phase 0 / 8 |
| Inbound email | Cloudflare Email Routing | Phase 6 |
| AI | Claude API | Phase 9 |
| Online payments | e.g. Stripe | Later |
| Social publishing | e.g. Ayrshare | Later |
| WhatsApp / SMS | e.g. Twilio | Later |
| E-signature | e.g. a signing API | Later |

Each partner sits behind an adapter in `platform/` so it can be swapped; a
module that needs an unconfigured partner shows "connect to enable". Check
current pricing and terms before adopting one.

## 16. Phases and acceptance criteria

| Phase | Content | Done when |
|---|---|---|
| **0. Foundation** `Built` | Port and clean up (§5), `workspace_id` everywhere, i18n, tests (deploy and email domain moved to the end, §3) | `validate` + tests pass; sign-in, 2FA, passkeys, invitations work in EN and ES |
| **1. CRM core** (steps 1–6 `Built`; acceptance check met 2026-11-03, browser checks pending) | Contacts & companies, custom fields + groups, saved views, event log + timeline, notes, tags, Generic template, import/export | A new workspace gets the template; a contact with custom fields can be created, filtered, imported, exported; isolation tests pass |
| **2. Sales** `Built` (steps 1–7, #22–#28; acceptance criterion covered by `tests/integration/sales-chain.test.ts`; browser checks pending) | Pipelines & deals, quotes, orders, invoices, payments | Deal → quote → order → invoice → partial payments → paid, all on the timeline |
| **3. Work** `Built` (steps 1–5, #29–#31 and this PR; acceptance criterion covered by `tests/integration/work-chain.test.ts`; browser checks pending) | Projects, tasks & calendar re-ported, files & folders (R2) | A won deal becomes a project with tasks and files; downloads are permission-checked |
| **4. Customer portal** | Email-link sign-in, contact isolation, profile, quotes, invoices & payments, projects, files | A contact accepts a quote and reports a payment; contact-isolation tests prove one contact can't see another's data |
| **5. Custom objects** | Object definitions, records, relationships, permissions, views, portal visibility | An admin creates "Membership" linked to contacts, with views, workflows-ready events and optional portal display |
| **6. Service** | Tickets (email + portal), knowledge base, surveys | An email creates a ticket, replies thread, closing sends a survey, the portal shows tickets and articles |
| **7. Automation** | Workflows, scheduled triggers, run log | "Deal won → create project + task + email" runs once, is logged, and can't loop |
| **8. Marketing** | Segments, consent, unsubscribe, campaigns, delivery stats | A campaign reaches only consented contacts, in their language, within limits |
| **9. AI** | Summaries, drafts, KB suggestions, usage limits | AI features respect permissions and limits; can be switched off |
| **Later** | Online payments, social publishing, WhatsApp/SMS, more templates, custom roles, custom reports, e-signature | — |

### 16.1 Where to resume (handoff, updated 2026-11-04)

**Done:** phase 0; phase 1 (steps 1–6, #11–#20; acceptance check #21); phase 2 (steps 1–7, #22–#28; step 7, the timeline across the sales chain and the end-to-end acceptance test, merged in #28). **Phase 3 (Work) started 2026-11-03** (owner): step 1, projects, merged in #29; its migration `0014_projects` (additive) was applied on 2026-11-03 and verified (9 columns, the indexes incl. one active project per deal, the 4 demo projects planned). Steps 2 and 3 (tasks and activities rebuilt, old `customer` table retired) were built together (owner decision, §3) and merged in #30; migrations `0015_tasks_subjects` (additive) and `0016_drop_customers` (destructive) were applied on 2026-11-04 with the owner's approval and verified (17 migrations recorded, `customer` gone, new columns and 4 indexes, 7 tasks and 4 activities kept), and the `test` branch was recreated. Step 4 (files and folders) was merged in #31; migration `0017_files` (additive) was applied on 2026-11-04 with the owner's approval and verified (18 migrations recorded, 2 tables, 4 indexes, 7 foreign keys, existing rows unchanged), and the `test` branch was recreated. Step 5 (the phase 3 acceptance check, no migration) is on `test/phase3-acceptance`; with it phase 3 is done. Migrations `0000`–`0017` are applied to the Neon `main` branch (dev database); `0006_pipelines` (additive) was applied on 2026-11-03 and verified (2 tables, 3 foreign keys, 2 indexes, other tables' row counts unchanged); `0007_deals` (additive) was applied on 2026-11-03 and verified (1 table, 6 foreign keys, 6 indexes, row counts unchanged); `0008_products_archive` was applied on 2026-11-03 and verified (2 columns; 2 products, none inactive, so the backfill changed nothing). `0009_quotes` (additive: 2 tables, 8 foreign keys, 6 indexes) was applied on 2026-11-03 and verified (row counts unchanged). `0010_orders_invoices_on_contacts` (destructive: deletes every row of `invoice_line`, `invoice`, `order_line` and `sales_order`, 1 demo order and 1 demo invoice in dev, then adds the new columns, foreign keys and indexes; tasks and activities that pointed to the order lose only that link, `ON DELETE SET NULL`) and `0011_drop_customer_from_orders` (drops `customer_id` from both tables) were applied before #26 was merged, and the step 4 and 5 integration tests then passed on a recreated `test` branch (91 in total). `0012_payments` (additive: the `payment` table with 4 foreign keys and 2 indexes, `invoice.paid_cents` default 0; plus `invoice.order_id`'s foreign key dropped and re-added as no action instead of restrict) was applied on 2026-11-03 and verified; the `test` branch was then recreated and all 97 integration tests pass (step 7). `0013_invoice_deal_index` (additive) was applied on 2026-11-03.

**Phase 3 plan (one PR per step, except steps 2 and 3 together; owner decisions of 2026-11-03 in §3):**

| Step | Content | Status |
|---|---|---|
| 1 | Projects: status planned / active / on hold / completed / cancelled, start and due dates, owner, optional contact and company, source deal; list with saved views and filters, project page, custom fields, tags, notes, timeline, EN/ES; **"Create project" on a won deal** (one active project per deal); Projects cards on contact, company and deal pages; project milestones on contact and deal timelines; `mergeContacts` moves projects (§10) | `Built` (#29); migration `0014` applied to dev |
| 2 | Tasks and activities rebuilt in `src/modules/tasks`, EN/ES: each about one record (contact, company, deal, quote, order or invoice) plus an optional project; milestones are tasks flagged as milestone (need a project); board and calendar; "Tasks and activities" card on record and project pages; timelines; `mergeContacts` moves them; dashboard rewritten on contacts (§10) | `Built` (#30, together with step 3, owner decision §3); `validate` passes (112 unit tests); 107 integration tests pass |
| 3 | Retire the old `customer` table and pages: tasks and activities lose their links to old customers and stay (destructive migration, asked first; §3) | `Built` (#30); migrations `0015`/`0016` applied to dev on 2026-11-04 |
| 4 | Files and folders: workspace tree (5 levels) plus files on every record; R2 in production, Miniflare's local-disk bucket in dev (§3, §9); 25 MB per file, 1 GB per workspace; permission-checked downloads; rights follow the record; events; payment receipts; workspace deletion removes the objects | `Built` (#31); migration `0017` applied to dev on 2026-11-04; `validate` passes (117 unit tests, 1,333 i18n keys); 114 integration tests pass |
| 5 | Acceptance: a won deal → a project with tasks and files; downloads permission-checked; a full-chain integration test | `Built` (this PR); no migration; `tests/integration/work-chain.test.ts` covers the acceptance criterion; `validate` (117 unit tests, 1,333 i18n keys) and 116 integration tests (20 files) pass |

**Phase 2 plan (one PR per step, done):**

| Step | Content | Status |
|---|---|---|
| 1 | Pipelines and stages (§10) | `Built` (#22); integration tests pass on the recreated `test` branch |
| 2 | Deals: list and board, value, expected close, won/lost with a required reason, owner, contact required + optional company; custom fields, views, tags, notes, timeline; `mergeContacts` moves deals; a stage with deals can't be removed or change type | `Built` (#23); integration tests pass (71 in total) |
| 3 | Products rebuilt in the module layout, EN/ES: saved views, custom fields, archive instead of delete, a line picker | `Built` (#24); migration `0008` applied to dev |
| 4 | Quotes: from a deal or a contact, `QUO-0001`, catalog lines (snapshot) plus free-text lines, draft → sent → accepted / declined (expired worked out on read), valid until defaults to 30 days after sending, printable page, send by email; staff mark it accepted until the portal (phase 4); accepting offers to mark the deal won (owner decision, §3) | `Built` (#25); migration `0009` applied to dev; integration tests pass |
| 5 | Orders and invoices re-ported to contact + optional company/deal: **"create order from quote"** (from an accepted quote, one order per quote), invoice from an order (one non-void invoice per order) or direct, numbered on issue (`INV-2026-0001`), overdue worked out on read, printable page, send by email; shared `src/modules/documents`; `mergeContacts` moves orders and invoices | `Built` (#26); migrations `0010`/`0011` applied to dev; integration tests pass (91 in total) |
| 6 | Payments: editors record (waiting as reported), owners/admins record confirmed at once and confirm, reject or reverse; partial payments (`partially_paid`, `paid`); balance = total − confirmed (`paid_cents`); overpayment refused, also under concurrency; no voiding with payments; drafts of an order locked to it; a `reported` status ready for the portal | `Built` (#27); migration `0012` applied to dev; integration tests pass |
| 7 | End-to-end acceptance integration test (deal → quote → order → invoice → partial payments → paid, all on the timeline), the timeline across the chain (orders and invoices already move on merge, step 5); then the phase 2 acceptance check | `Built` (#28); no migration; `tests/integration/sales-chain.test.ts` covers the acceptance criterion; 97 integration tests and `validate` (106 unit tests) pass |

Real email delivery of quotes and invoices waits for the domain (§19); until then emails print to the dev console or reach only the Resend account owner (§17 pitfall 9).

**Phase 1 acceptance check (2026-11-03): met in code and tests.**
- A new workspace gets the template: `src/lib/auth.ts` (sign-up and "New workspace"), `templates.test.ts`.
- A contact with custom fields can be created, filtered, imported, exported: `fields.test.ts`, `views.test.ts`, `csv.test.ts`.
- Isolation tests pass: each module tests that workspace B can't reach A's data. The workspace-deletion test in `isolation.test.ts` now also proves that every phase 1 table (company, contact, tag, record_tag, note, event, field_group, field_definition, saved_view) is emptied with the workspace.
- Not proven yet: nothing has run on the real Workers runtime (deploy waits until the end, §3); the 50-subrequest limit is respected by design (CSV import, merge) but only exercised on Node.

**Phase 2 acceptance check (2026-11-03): met in code and tests.** "Deal → quote → order → invoice → partial payments → paid, all on the timeline": `tests/integration/sales-chain.test.ts` runs it through the same data layer the pages use (pipeline, contact, deal; a quote from the deal, sent, accepted; the deal moved to won; an order from the quote, confirmed; an invoice from the order, issued; a confirmed partial payment, then an editor's payment confirmed → paid) and checks that the contact's and the deal's timelines contain every step and no routine edit (`quote.updated`); a second test proves another workspace's records never reach a contact's timeline. Not proven yet: nothing has run on the Workers runtime (deploy at the end, §3), and no browser check of phase 2 has been done.

**Phase 3 acceptance check (2026-11-04): met in code and tests.** "A won deal becomes a project with tasks and files; downloads are permission-checked": `tests/integration/work-chain.test.ts` (2 tests) runs it through the same data layer the pages use.
- The chain: a pipeline, a contact, a deal moved to won, "Create project" from the deal (name, contact and deal carried over), a milestone task completed, a task about the deal on the project, a meeting on the project, files on the project and on the deal. The project card lists both tasks and the activity; the project's timeline has `project.created`, `task.created`, `task.completed`, `activity.created`, `project.file_added`; the deal's has `deal.won`, `project.created`, `task.created`, `deal.file_added`; the contact's has `deal.won` and `project.created` and no file events.
- Downloads: `authorizeDownload(access, fileId)` in `src/modules/files/files.server.ts` is the single download check, and `GET /api/files/<id>` builds `access` from the session (`activeOrganizationId`, `auth.api.hasPermission`) and calls it. Every role (owner, admin, editor, viewer) reads a project file and a workspace-folder file and gets the uploaded bytes; no session → 401; no active workspace → 403; another workspace's owner → 404; a role without read on the record, or an unknown role → 404; malformed and unknown ids → 404. The test checks roles with `roleCan` (the same role table Better Auth uses).
- Not proven yet: nothing has run on the Workers runtime (deploy at the end, §3; the R2 bucket is created then); no browser check of phase 3; Better Auth's own `hasPermission` call in the route isn't exercised by tests (integration tests have no signed-in session).

**Next:** phase 3 is complete. Phase 4 (customer portal) starts only when the owner says so (CLAUDE.md rule). The browser checks of phases 1–3 (below) are still open.

**Later (agreed, not scheduled):** merging duplicate companies the same way (owner decision 2026-11-03, §3); custom fields, saved views and tags on tasks and activities (need a table view; suggested, §10); moving files between folders and a sweep job for orphaned objects (§9).

**At the final deploy (§3):** create the R2 bucket `generic-crm-files` in the Cloudflare account (Cloudflare likely asks for a payment method; free tier 10 GB); measure subrequests per record page (the contact page calls 12 server functions) and upload CPU/memory on Workers (§9, §17 pitfall 15).

**Waiting on the owner:**
- the browser check of files and folders (EN/ES: the Files card on contact, company, deal, quote, order, invoice and project pages, upload, download, share with customer, delete; "Attach receipt" on a payment and "Receipt added" on the invoice timeline; `/files` with breadcrumbs, new / rename / move / delete folder, the 5-level limit, a non-empty folder refused, the storage meter; a disallowed type and a file over 25 MB refused; the tasks and files cards full width after the timeline);
- the browser check of tasks, activities and the calendar (EN/ES: `/tasks` board with drag and drop and the search, assignee, priority, project and "due within" filters; `/calendar` day, N days, week and month; the task and activity forms with the record picker and the project select, a milestone without a project refused; the "Tasks and activities" card on contact, company, deal, quote, order, invoice and project pages, prefilled when creating; task and activity events on the record's and project's timelines; the rewritten `/dashboard`; `/customers` gone from the sidebar);
- the browser check of projects (EN/ES: `/projects` with views, filters, search and active/archived; create, edit, status change, archive and restore; the project page with tags, notes, custom fields and the "Status changed to X" timeline; the Projects tab in Settings → Fields; the Projects cards on contact, company and deal pages; **"Create project" on a won deal**, refused for a second active project; project milestones on the contact's and deal's timelines);
- the browser check of the timeline across the chain (EN/ES: on a contact and on a deal, the milestones of its quotes, orders and invoices with a link such as "QUO-0001: Accepted" or "INV-2026-0001: Payment confirmed"; their edits, tags and notes not shown there);
- the browser check of payments (EN/ES: the Payments card on an issued invoice; "Record payment" as an editor (waiting) and as an owner/admin (confirmed at once); confirm, reject with a reason and reverse; partially paid, paid and overdue statuses; an overpayment refused; void refused while payments exist; a draft invoice created from an order shown locked; payment wording on the timeline);
- the browser check of orders and invoices (EN/ES: "Create order" on an accepted quote; "New order" and "New invoice" from a contact and a deal; the draft editors; confirm, fulfil, cancel and "Back to draft", refused while invoiced; "Create invoice" from an order; issue (number, due date), void, overdue; send by email (the email prints in the dev console); "Print / Save as PDF" in both languages; the lists with views, filters and search; the Orders and Invoices tabs in Settings → Fields; tags, notes and timelines);
- the browser check of quotes (EN/ES: `/quotes` with views, filters, search, the expired status and total; "New quote" from the list, a contact and a deal; the draft editor with catalog and free-text lines and live totals; send by email (the email prints in the dev console) and mark as sent; accept with "Mark deal won", decline with a reason, "Back to draft"; "Print / Save as PDF" in both languages with the app shell hidden; the Quotes tab in Settings → Fields; tags, notes and the timeline);
- the browser check of products (EN/ES: list with views, filters, search, active/archived and the price in the workspace currency; create, edit, archive and restore; a duplicate SKU; the Products tab in Settings → Fields; the product picker in document editors);
- the browser check of deals (EN/ES: list with views, filters, search and total; board with the stage picker and the lost-reason dialog; the deal page; the Deals cards and "New deal" on contact and company pages; the Deals tab in Settings → Fields);
- the browser check of Settings → Pipelines (EN/ES: create, edit stages, reorder, archive/restore, the template card's pipeline count);
- the browser check of the merge screen in EN and ES (merged in #20 before it) ("Merge with…", search, swap, choices, confirm, both timelines);
- the browser check of CSV import/export (EN/ES, skip and update, a `;` file);
- confirming that archived records count as "existing" on import;
- product name and domain (§19);
- adding `TEST_DATABASE_URL` to `.env.local` if wanted. The value changes each time the `test` branch is recreated, so passing it inline as below works too.

**How to resume:**
1. `git checkout main && git pull`, then a new branch per change.
2. `bun install`; `bun run i18n:compile` if the editor shows missing `m.*` functions (§17 pitfall 12).
3. Checks:
   - `bun run validate`;
   - integration tests: `TEST_DATABASE_URL="$(neon connection-string test --project-id wandering-river-71683346)" bun run test:integration` (Neon project `wandering-river-71683346`; never print the URL);
   - after a new migration, recreate the schema-only `test` branch (§17 pitfall 11).
4. Signed-in checks without the owner's server:
   - run a fresh `bunx vite dev --port 3100 --strictPort` and send `Origin: http://localhost:3000`;
   - sign up a `phase0-test-…@example.com` user, mark it verified with SQL, and delete that user and its workspace afterwards (clear `rate_limit` if sign-up is throttled);
   - keep the owner's 2 users and 2 workspaces;
   - UI changes still need the owner's browser check.
5. Before committing:
   - `security-reviewer` for server, route, permission, auth or schema changes;
   - the spec update in the same PR;
   - ask before committing and again before pushing; give the PR link and description (`gh` isn't installed).

## 17. Conventions and pitfalls (inherited from `my-tanstack-app`)

Conventions: tenant isolation and reference checks · `requirePermission` on
every server function · shared Zod schemas, server re-checks anything the
client could fake (prices from the catalog) · server-side lists with state in
the URL and `.catch()` defaults · status machines as guarded `UPDATE … WHERE
status = <from>` · money in cents, tax in basis points, UTC dates, all-day at
12:00 UTC · `db.batch` for atomic multi-statement writes (neon-http has no
interactive transactions) · accessibility (labels, `aria-invalid`, keyboard, no
color-only information) · Biome style · seeds tagged `[demo]`.

Pitfalls already paid for:
1. Plain exported `db` helpers in modules routes import ship the database client to the browser → `*.server.ts` + `check:bundle`.
2. `bun run dev` must be `vite dev` on Node (Miniflare breaks under `bun --bun` on Windows).
3. LF line endings via `.gitattributes`.
4. The dev server rewrites `routeTree.gen.ts`; commit it with route changes.
5. curl doesn't run browser JavaScript; every UI change needs a browser check.
6. TanStack Table v9 is feature-based; Start uses `.validator()` in this version.
7. shadcn CLI overwrite prompts: answer "no".
8. Bun on Windows ignores `TZ=` on the command line.
9. Resend's test sender delivers only to the account owner; verify a domain before inviting others.
10. A second `bun run dev` used to move silently to port 3001 while `BETTER_AUTH_URL` and the auth links still point to 3000, so requests and printed emails ended up on the old server. `dev` now uses `--strictPort` and fails with "Port 3000 is already in use": stop the other server first. Without Resend, auth emails print to the dev server output as `[email:dev]` lines.
11. The Neon `test` branch is schema-only: it copies tables, not rows, so its Drizzle migration log is empty. After a new migration, recreate it from `main` (`neon branches delete test` then `neon branches create --name test --parent main --schema-only`) instead of running migrations against it.
12. `src/paraglide/` is generated and git-ignored: `typecheck` compiles it first, so run `bun run i18n:compile` (or `typecheck`) after a fresh clone or after editing `messages/*.json` if the editor shows missing `m.*` functions. Compiling fetches the inlang message-format plugin (pinned to an exact version in `project.inlang/settings.json`) from jsDelivr, so builds need network access to it. Keep `outputStructure`/`--output-structure` set to `message-modules` in both `vite.config.ts` and the `i18n:compile` script: the Vite plugin otherwise switches layout between dev and build, and `typecheck` then fails on missing `.d.ts` files.
13. Drizzle renders columns inside a `select({...})` as bare names (`"id"`), so a correlated subquery in a `sql` fragment silently resolves them to its own table (a company's contact count came back 0). Spell out table names (`"company"."id"`) or aliases in such subqueries, and cover them with a test.
14. A dev server left running for many hours of code changes can end up answering 500 on every page while a fresh one works: restart it before concluding the code is broken.
15. Every Neon HTTP query (`neon-http`) is one subrequest, and the Workers free plan allows 50 per request (and about 10 ms CPU). A loop that queries per row works on `bun run dev` (Node) but dies halfway on Workers. Bulk work loads in a few set-based queries and writes in one `db.batch`, and the browser sends large inputs in batches (see CSV import, §10).
16. A `YYYY-MM-DD` regex is not a date check: `new Date("2024-02-31T12:00:00Z")` silently rolls over to 2 March, so an impossible day was stored as a different one (security review, deals). Date inputs also check the round trip (`toISOString()` starts with the input), as `optionalDay` in `src/modules/deals/schema.ts` does.
17. The Workers free plan has no cron for this app yet, so time-based states are worked out on read instead of by a job: a quote's "expired" is `sent` plus a past valid-until day (`displayStatus` in `src/modules/quotes/schema.ts`, and the same condition in SQL for the list filter). Never store such a state; keep the TypeScript and SQL versions in step. The same holds for an invoice's "overdue" (`invoiceDisplayStatus` in `src/modules/invoices/schema.ts` and the list's status filter).
18. `drizzle-kit generate` asks interactively whether a new column is a rename of a dropped one (e.g. `contact_id` replacing `customer_id`), and that prompt can't be answered without a TTY (Claude's shell, CI), so the command stops. Split such a change into two migrations: first add the new columns with the old ones still in the schema (`0010`), then remove the old columns in a second generate (`0011`), so neither run has both a drop and an add to ask about.
19. To stop a parent row from being deleted while children point to it, use a plain (no action) foreign key, not `ON DELETE RESTRICT`, when both tables also cascade from the workspace. `RESTRICT` is checked at once, so deleting a workspace can fail depending on which cascade reaches the parent first; no action is checked at the end of the statement, after the cascade has removed the children too. `payment.invoice_id` and `invoice.order_id` use it since `0012`.
20. When a table is removed, `drizzle-kit generate` may put `DROP TABLE … CASCADE` first and the drops of the foreign keys, indexes and columns that point to it after, so the later statements fail on constraints the cascade already removed, and `CASCADE` silently drops anything the schema forgot. Read a destructive migration before applying it and reorder it by hand: foreign keys, then indexes, then columns, then a plain `DROP TABLE` (as in `0016_drop_customers`).
21. Polymorphic links (`subject_type` + `subject_id` on tasks and activities, like the event log) have no foreign key, so the database never checks them: the server must check the pair on every write that sets or changes it (an active record of the workspace), and every read that joins through them must filter the joined table by the session's workspace too.
22. Biome's formatter rewrites `\u` escapes in strings and regexes into the literal invisible characters (zero-width, bidi marks), so a check written as `/[​-‏]/` ends up as invisible text that reviewers can't see and editors may strip. Write such checks with char codes (`codePointAt`), as the file-name rules in `src/modules/files/schema.ts` do.
23. In bun tests, build arrays of calls as functions (`() => call()`), not as started promises. A promise created eagerly that rejects before the loop awaits it is an unhandled rejection: bun ends the test early, `afterAll` cleanup runs, and later checks intermittently read empty data (the `files.test.ts` isolation loop read 0). Start each call when it is awaited.

## 18. Workflow

- Branch per change from `main`; never commit to `main`; `commit-and-push` skill with two confirmations; PR link and description for the owner (`gh` not installed).
- Definition of done: `bun run validate` (typecheck, Biome, build, bundle check, **tests**, **i18n keys**) + a browser check for UI changes.
- Ask before applying migrations; update this specification in the same PR.
- Subagents (`project-navigator`, `validator`, `resource-builder`, `migration-guard`, `security-reviewer`, `spec-keeper`) are copied from `my-tanstack-app` and updated for the module layout (`src/modules/<module>/{schema.ts, <module>.server.ts, <module>.ts, components/}`), `workspace_id`, custom fields, events, i18n and the Workers free-plan limits.

## 19. Open questions

1. **Product name and domain** (needed for the portal address, email sender and passkeys; real delivery of phase 2 quote and invoice emails also waits for it).
2. ~~**i18n library**~~ Answered 2026-11-02: Paraglide JS (§3).
3. **Custom subdomains** for portals (`acme.example.com`) — when?
4. **Data location** (Neon region, R2 location) if customers need data kept in a region.
5. **Backups and restore** beyond Neon's point-in-time recovery: per-workspace export schedule?
6. **First real users:** which businesses will try it first? Their needs set the details of phase 1–2.

## 20. Changelog

| Date | Change |
|---|---|
| 2026-11-02 | Draft 1: vision, principles, decisions, architecture, data model, customization engine, portal, files, modules, events/workflows, security and limits, AI, i18n, partners, phases (designed in `my-tanstack-app` PR "docs: add Generic CRM design") |
| 2026-11-02 | Initial import: foundation copied from `my-tanstack-app` unchanged; this specification, `CLAUDE.md`, `README.md` |
| 2026-11-02 | Phase 0 step 1: starter leftovers removed (Neon auto-provision plugin, Sentry, legacy `src/db.ts` and `header-user.tsx`), package/Worker renamed `generic-crm`, complete `.env.example`; `dev` and `build` work again (#1) |
| 2026-11-02 | Phase 0 step 2: own Neon project `generic_crm` linked (`neon.ts`, `@neon/config`), `drizzle-kit` uses the unpooled URL (#2) |
| 2026-11-02 | Phase 0 step 3: tenant columns renamed to `workspace_id`, `workspace_setting`/`workspace_counter`, `context.workspaceId`; fresh migration `0000_initial` applied (#3) |
| 2026-11-02 | `dev` uses `--strictPort` so a second dev server fails instead of moving to port 3001 (#4) |
| 2026-11-02 | Phase 0 step 4: `bun test` unit tests in `tests/unit/` (40 tests), added to `validate`; Biome also checks `tests/` (#5) |
| 2026-11-02 | Phase 0 step 5: workspace-isolation integration tests on the Neon `test` branch (`bun run test:integration`, 9 tests) (#6) |
| 2026-11-02 | Phase 0 step 6: Paraglide JS i18n foundation (EN/ES, cookie → browser → English), `src/server.ts` Worker entry, login page translated, `check:i18n` in `validate` (#7) |
| 2026-11-02 | i18n: auth pages, auth validation and Better Auth error messages in EN/ES (120 keys); owner decisions: zero-cost plan, business pages translated when rebuilt (#8) |
| 2026-11-02 | i18n: app shell, account security and workspace pages, role labels; language choice moved to the user menu; app name shown as "Generic CRM" (188 keys) (#9) |
| 2026-11-02 | i18n: auth emails in EN/ES (25 keys); one `APP_NAME` from the `app_name` message for Better Auth, TOTP issuer, passkeys and emails; phase 0 i18n complete (#10) |
| 2026-11-02 | Phase 1 step 1: `event` log, `company` and `contact` tables (migration `0001`, applied), contacts and companies data layer, server functions, list and detail pages in EN/ES, `contact`/`company` permissions, UUID v7 ids, localized country names and list controls, 9 new integration tests; owner decision: production deploy at the end (#11) |
| 2026-11-02 | Phase 1 step 2: tags, notes and the record timeline for contacts and companies (migration `0002`, applied); tag filter and column on both lists; `requireWorkspace` + `assertPermission` for input-dependent permissions; 7 new integration tests (#12) |
| 2026-11-02 | Old Customers page labeled "Customers (old)" with a notice pointing to Contacts; it is removed when orders and invoices move to contacts (phase 2) (#13) |
| 2026-11-02 | Phase 1 step 3: custom fields engine for contacts and companies (migration `0003`, applied): field groups and definitions with EN/ES labels, settings page, fields on forms and record pages, server-side validation from the definitions, timeline names custom fields; `field` permission; money formatted in the reader's language; 7 unit and 5 integration tests (#14) |
| 2026-11-02 | Calendar "N days" view and task board "due within" filter, saved per person in `user_preference` (migration `0004`, applied) (#15) |
| 2026-11-02 | Phase 1 step 4: saved views for contacts and companies (migration `0005`, applied): filters on built-in and custom fields, chosen columns, custom-field sort, private/shared views; 3 unit and 7 integration tests (#16) |
| 2026-11-02 | Phase 1 step 5: Generic template (`templates/generic.json`) applied to new workspaces and addable from Settings → Fields; `resolveJsonModule` on; 2 unit and 2 integration tests (#17) |
| 2026-11-02 | Phase 1 step 6a: CSV import and export for contacts and companies (`src/modules/csv`, no migration): export of all fields for the current search/filters (10,000 rows max, BOM, formula neutralizing); 3-step import with EN/ES column mapping, dry run, skip or update existing records (email/domain), 1,000 rows / 2 MB sent in batches of 100 rows (Workers free-plan subrequest limit), each batch one transaction, `;` detection; owner decisions: skip/update per import, 1,000-row limit, export of all fields; 5 unit and 9 integration tests (#18) |
| 2026-11-02 | Docs: handoff notes for the next session (§16.1, header), README status, `security-reviewer`/`resource-builder`/`validator` agents describe the module layout, events and Workers free-plan limits (#19) |
| 2026-11-03 | Phase 1 step 6b: merging duplicate contacts (no migration): "Merge with…" search dialog, side-by-side screen with swap and per-field choices, server recomputes values from the stored records, one `db.batch` that clears and archives the duplicate, moves notes and tags (20-per-record limit) and writes `contact.merged` on both; `prepareCustom` skips several ids; owner decisions: `update` + `delete` required, no undo, contacts only (companies later); security review fixes (a `FOR UPDATE` guard against concurrent merges, revoked consent wins); 10 unit and 4 integration tests (#20) |
| 2026-11-03 | Phase 1 acceptance check: criteria met in code and tests (§16.1); the workspace-deletion isolation test now covers every phase 1 table (#21) |
| 2026-11-03 | Phase 2 starts; step 1: pipelines and stages (migration `0006`, applied to `main`): `pipeline`/`pipeline_stage` tables, `pipeline` permission, Settings → Pipelines page and dialog, stage rules (≥1 open, exactly 1 won and 1 lost, won 100 / lost 0), whole-list save that archives stages left out, ≥1 active pipeline guarded in SQL, `pipeline.*` events; Generic template adds the "sales" pipeline; owner decisions on contact links for documents, printable pages instead of PDFs, one tax rate, contact required on deals; phase 2 plan in §16.1; 4 unit and 4 integration tests (#22) |
| 2026-11-03 | Phase 2 step 2: deals (migration `0007`, applied to `main`): `deal` table and permission, `/deals` list (views, filters, search, total value) and board per pipeline (stage picker, open plus last 90 days of won/lost, 500 cards), deal page, Deals cards on contact and company pages, Sales → Deals in the sidebar; status derived from the stage, lost needs a reason, `deal.*` events and timeline wording; custom fields, saved views, tags and notes on deals; stage writes guarded by the pipelines' advisory lock and in-batch checks (409 on concurrent moves, restore into a removed stage); pipelines refuse removing or retyping stages with deals and archiving a pipeline with open deals; `mergeContacts` moves deals (`dealsMoved`); real-calendar-day check (pitfall 16); 7 unit and 9 integration tests (#23) |
| 2026-11-03 | Phase 2 step 3: products rebuilt in `src/modules/products` (migration `0008`, additive + backfill, applied to dev): `/products` in EN/ES with saved views, search (name/SKU/description), active/archived and the price in the workspace currency; custom fields on products (Settings → Fields "Products" tab); archive/restore instead of delete (`active` kept in step until orders are re-ported); SKU rules (1–32 `[A-Z0-9._-]`, upper-cased, unique ignoring case, archived included); `product.*` events; `pickProducts` for document line pickers, used by the old order pages; old `src/lib/products.ts`, page and Zod schemas removed; 5 unit and 5 integration tests (#24) |
| 2026-11-03 | Phase 2 step 4: quotes in `src/modules/quotes` (migration `0009`, additive, applied to dev): `quote`/`quote_line` tables and `quote` permission, `QUO-0001` numbers per workspace; `/quotes` (views, search, status incl. expired, active/archived, total value) and the quote page (draft editor with catalog and free-text lines, server-computed totals, printable document in the quote's language, send by email or mark as sent, accept with "Mark deal won", decline with a reason, back to draft, archive); Quotes cards on contact and deal pages; Sales → Quotes; expired worked out on read; status changes locked and guarded in the batch; custom fields, saved views, tags, notes and timeline on quotes; `mergeContacts` moves quotes; `sendEmail`/`escapeHtml` exported, `reply_to`; owner decisions on accepting, sending and no discounts; 9 unit and 7 integration tests (#25) |
| 2026-11-03 | Phase 2 step 5: orders and invoices rebuilt on contacts in `src/modules/orders` and `src/modules/invoices`, with shared lines, totals, email and components in `src/modules/documents` (migrations `0010`, destructive: deletes the dev demo orders/invoices, and `0011`, drops `customer_id`; applied to dev): orders `ORD-0001` for a contact, a deal or an accepted quote ("Create order", one per quote, `quote.ordered`), draft → confirmed → fulfilled, cancel and back to draft refused while invoiced; invoices from a confirmed/fulfilled order ("Create invoice", one non-void per order, `order.invoiced`) or direct, issued as `INV-2026-0001` with due date from payment terms, void, overdue on read, send by email (caps 50/day, 5/invoice), no archiving while issued; `invoice:issue`/`void` for owner/admin; custom fields, saved views, tags, notes, timeline; Orders and Invoices cards on contact and deal pages; `mergeContacts` moves them; quotes use the shared line rules; old `src/lib/orders.ts`, `invoices.ts`, `OrderEditor`, routes, Zod schemas and `seed-sales.ts` removed; owner decisions on invoice sources, one invoice per order and deleting the demo data; pitfall 18 (drizzle-kit rename prompt); 10 unit and 6 integration tests (#26) |
| 2026-11-03 | Phase 2 step 6: payments in `src/modules/payments` (migration `0012`, additive plus `invoice.order_id` changed from restrict to no action; applied to dev): `payment` table (amount, paid-on day, method, reference, note, status reported/confirmed/rejected, source staff/portal, who recorded and decided) and `invoice.paid_cents`; a Payments card on issued invoices (paid, waiting, balance, "Record payment", Confirm / Reject / Reverse); an owner's/admin's payment is confirmed at once, an editor's waits; overpayment refused inside the batch, also under concurrency; every write locks the invoice and recomputes `paid_cents`, status (issued / partially paid / paid) and `paid_at`; `invoice.payment_recorded|confirmed|rejected` events and timeline wording; overdue includes partially paid; sending allowed while partially paid; voiding refused with payments; archiving only drafts not of an order and void invoices; a zero total can't be issued; drafts from an order locked to its contact, lines and tax (`DraftEditor` locked mode); owner decisions on confirming, voiding, receipts and order drafts; security review fixes (statuses bound as parameters, date slack, zero-total refusal, no-action foreign keys, the permissions comment); pitfall 19; 3 unit and 4 integration tests (#27) |
| 2026-11-03 | Phase 2 step 7: the timeline across the sales chain (no migration): a contact's timeline also shows the milestones of its deals, quotes, orders and invoices, a deal's those of its quotes, orders and invoices (everything except `*.updated`, `*.tag_*`, `*.note_*`), each with a link to the related record (`relatedName`/`relatedNumber`/`relatedYear` from workspace-filtered subqueries), still 200 events max; phase 2 acceptance test `tests/integration/sales-chain.test.ts` (deal → quote → order → invoice → partial payment → paid on the contact's and deal's timelines, plus a cross-workspace test); phase 2 code complete; 2 integration tests (97 in total) (#28) |
| 2026-11-03 | Phase 3 starts; step 1: projects in `src/modules/projects` (migration `0014`, additive, applied to dev): `project` gains status (planned / active / on hold / completed / cancelled), start and due dates (due ≥ start), owner, optional contact and company, source deal, custom fields and archiving; `/projects` list (saved views, filters, search, active/archived) and project page (tags, notes, custom fields, timeline) in EN/ES; "Create project" on a won deal (one active project per deal, deal locked and guarded in the batch); `project.*` events with "Status changed to X"; project milestones on contact and deal timelines; Projects cards on contact, company and deal pages; Settings → Fields "Projects" tab; `mergeContacts` moves projects; old `src/lib/projects.ts` and page removed; owner decisions on R2 storage with a local dev stand-in, dropping old-customer links of tasks/activities, the "Create project" button and file rights; phase 3 plan in §16.1; 3 unit and 4 integration tests (#29) |
| 2026-11-04 | Phase 3 steps 2 and 3 in one PR: tasks and activities rebuilt in `src/modules/tasks` (migrations `0015`, additive, and `0016`, destructive, applied to dev): each about one record (`subject_type`/`subject_id`: contact, company, deal, quote, order, invoice) plus an optional project, milestones flagged `is_milestone` (need a project); `/tasks` board (search, assignee, priority, project, due within; 500 max) and `/calendar` in EN/ES; forms with a record picker and project select; "Tasks and activities" card on contact, company, deal, quote, order, invoice and project pages; `task.*`/`activity.*` events and their milestones on record and project timelines; `mergeContacts` moves them; `/dashboard` rewritten on contacts, companies and projects in EN/ES; the old `customer` table, pages, permission, libs, components and seed removed, `PAGE_SIZES` renamed; owner decisions on one PR, one related record plus project, milestones; security review (no critical/high; known limits M1, L1–L3 in §10); pitfalls 20–21; 5 unit and 6 integration tests (107 in total) (#30) |
| 2026-11-04 | Phase 3 step 4: files and folders in `src/modules/files` (migration `0017_files`, additive, applied to dev): `folder` (nested tree, 5 levels, unique name per parent) and `file` (record files via `subject_type`/`subject_id`, receipts via `payment_id`, extension allow-list without HTML/SVG, `storage_key` `workspace/<id>/<uuid>`, shared with customer); R2 binding `FILES` in `wrangler.jsonc` behind `src/platform/storage.server.ts` (Miniflare local disk in dev, in-memory in tests); streaming upload route `POST /api/files` (Origin, size and permission checked before the body) and download route `GET /api/files/<id>` (404 without a hint, attachment, nosniff, CSP sandbox); Files card on every record page, "Attach receipt" on payments, `/files` page (Work → Files) with folders and a storage meter; 25 MB per file and 1 GB per workspace under a per-workspace lock; rights follow the record, new `file` permission for workspace folders; file and folder events (not on related timelines); `mergeContacts` moves files; workspace deletion removes its objects; fixed #30's tasks card nested inside the timeline card; owner decisions on record folders, the 5-level tree, the limits and no trash; security review (no critical/high; M1–M3, L1–L6 fixed); pitfall 22; 5 unit and 7 integration tests (114 in total) (#31) |
| 2026-11-04 | Phase 3 step 5: acceptance check (no migration): `tests/integration/work-chain.test.ts` (won deal → project with tasks, an activity and files on the project's, deal's and contact's timelines; downloads per role, without session or workspace, across workspaces and with bad ids); `authorizeDownload` in `files.server.ts` is now the single download check the route calls; `files.test.ts` isolation loop starts calls one at a time (pitfall 23); phase 3 done; 2 integration tests (116 in total) (this PR) |
