# Specification — Generic CRM

> Living specification for **Generic CRM**, a multi-tenant CRM for small
> businesses. Every section is a plan until it is marked **Built**. **Read it
> before changing anything; update it in the same PR as any change it
> describes** (`spec-keeper` agent).
>
> Status: **Phase 2 (Sales) in progress** (phases 0 and 1 done, phase 1
> browser checks pending; phase 2 started 2026-11-03: step 1, pipelines and
> stages, merged (#22); step 2, deals, merged (#23); step 3, products,
> merged (#24); step 4, quotes, built, migration `0009` applied to dev;
> next step 5, orders and invoices) ·
> 2026-11-03 ·
> repository `https://github.com/Fuema/generic_crm` (private).
>
> **Current code:** the rebuilt modules live in `src/modules/` (contacts and
> companies, records, fields, views, templates, preferences, csv, pipelines,
> deals, products, quotes) and
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

## 4. Stack and architecture `Carried`

Same stack as `my-tanstack-app` (see its specification §2–§4 for versions):
TanStack Start (React 19) on **Cloudflare Workers**, **Neon Postgres** over
HTTP with **Drizzle**, **Better Auth** (self-hosted: MFA and passkeys are
required), Tailwind 4 + shadcn/ui, TanStack Form/Query/Table, Zod, Biome, Bun.

New platform pieces:

| Need | Choice | Notes |
|---|---|---|
| File storage | **Cloudflare R2** | Private bucket; files only through authorized Worker routes |
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

### Source layout (planned; `src/platform` and `src/modules/` exist since phase 1: `contacts`, `records`, `fields`, `views`, `templates`, `preferences`, `csv`; phase 2 adds `pipelines`, `deals`, `products`, `quotes`)
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
| Better Auth setup: email + verification, social, 2FA (TOTP, email, backup codes), passkeys, rate limits, session rules, password policy, HIBP | `customer` table and pages → rebuilt as Contacts & Companies (phase 1); the table stays only for tasks and activities until phase 3 re-ports them, then it is dropped (owner decision 2026-11-03, §3) |
| Workspaces (Better Auth organizations), members, invitations, roles, `requirePermission`, last-used workspace | `project` example → rebuilt as the Projects module (phase 3) |
| App shell: sidebar, top bar, workspace switcher, user menu, theme, logo | Orders, invoices, tasks, calendar → re-ported onto the new data model (phases 2–3), keeping their rules |
| Email module (Resend + dev console fallback), `email:test` | ~~Legacy files: `src/db.ts`, `header-user.tsx`, `db/init.sql`; starter README~~ **Done** |
| Money/tax/date helpers, document counters, list pattern (URL state, server-side table) | ~~Sentry rules and env vars~~ **Done** (package removed; can be added back later) |
| Tooling: Biome, `validate`, `check:bundle`, `.gitattributes` (LF), `vite dev` on Node | Old migrations: start a **fresh migration history** |
| `.claude/agents/` (adapted), `.claude/skills/` (master copy moves here) | Demo seeds → new seeds per module |
| — | Starter leftovers that the copy left dangling: the `neon-vite-plugin.ts` import in `vite.config.ts` (it auto-provisions a throwaway Neon database and seeds the old to-do schema) and `instrument.server.mjs` (Sentry) in the `build`/`start` scripts. Remove both references. **Done:** also removed `vite-plugin-neon-new`, `@neon/config`, `@neon/env`; package and Worker renamed `generic-crm` |

Phase 0 also adds:
- ~~Own Neon database~~ **Done:** project `generic_crm` linked with `neon init` (`neon.ts` declares Postgres only; Neon Auth off because Better Auth is self-hosted). `neon deploy` pulls `DATABASE_URL` (pooled, used by the app over the HTTP driver), `DATABASE_URL_UNPOOLED` (used by `drizzle-kit`) and `NEON_BRANCH` into `.env.local`. The database is still empty: the fresh migration history comes next.
- ~~**Rename tenant columns to `workspace_id`**~~ **Done:** every app table uses `workspace_id` (`workspaceId` in code), `tenant_setting`/`tenant_counter` are `workspace_setting`/`workspace_counter`, and `requirePermission` puts `context.workspaceId` in the handler context. Better Auth's own tables (`member`, `invitation`, `session.active_organization_id`) keep the library's `organization` names because its organization plugin depends on them.
- ~~**Fresh migration history**~~ **Done:** `drizzle/0000_initial.sql` (21 tables) applied to the `generic_crm` database on 2026-11-02.
- **Automated tests from day one:** `bun test` for unit rules; integration tests on a dedicated Neon branch for isolation (workspace A never sees workspace B). **Unit tests done:** `tests/unit/` (money and tax, all-day/timed dates, the role matrix, input schemas), run by `bun run test` and part of `validate`; written to pass in any time zone (pitfall 8). **Integration tests done:** `tests/integration/` runs against the Neon branch `test` (schema-only copy of `main`) through `TEST_DATABASE_URL` with `bun run test:integration`. A preload refuses to run if the URL is missing or equals `DATABASE_URL`; each run creates randomly named workspaces and deletes them. They cover `assertWorkspaceRefs` across workspaces, per-workspace and concurrent document numbers, settings isolation, per-workspace unique email/SKU and cascade deletes. Not part of `validate` (needs the network and the test branch). Server-function-level isolation tests come in phase 1, when module queries move into `*.server.ts` functions that take the workspace id.
- **i18n setup** (EN/ES) for every string ported. **Setup done:** Paraglide compiles `messages/*.json` (`bun run i18n:compile`, also run by `typecheck` and the Vite plugin); `src/server.ts` wraps every request in `paraglideMiddleware` (it is the Worker entry in `wrangler.jsonc`); `<html lang>` follows the locale; `LanguageSwitcher` saves the choice in the `PARAGLIDE_LOCALE` cookie and reloads; `check:i18n` in `validate` fails on missing or empty translations. **Converted:** all guest/auth pages (sign-in, sign-up, forgot/reset password, two-factor, verify email), their components, the auth validation messages in `src/lib/schema.ts` (Zod messages are `{ error: () => m.…() }` and password rule labels are functions, so server-side checks answer in the request's language) and the Better Auth error messages (`authErrorMessage`); the app shell (sidebar and its navigation labels, top bar, theme toggle, user menu, which now holds the language choice, `<title>`), the account security page and its components, the workspace pages (members, settings, new workspace, billing defaults, invitations) with their validation messages, and the role labels (`ROLE_LABELS` entries are functions). The visible app name comes from the `app_name` message ("Generic CRM" until the product name is decided, §19).; and the auth emails (verification, password reset, sign-in code, invitation, test email) with `<html lang>`. Emails use the language of the request that triggers them: the recipient's own for verification, reset and codes; the inviter's for invitations, until members' saved language preference arrives in phase 1. `APP_NAME` (Better Auth `appName`, TOTP issuer, passkey `rpName`, emails) is `m.app_name()` in the base locale, exported from `src/lib/email.ts`. **Phase 0 i18n is complete** for everything that is kept. **Not converted on purpose:** business pages and their schemas (customers, orders, invoices, tasks, calendar, projects, dashboard): they are written with `m.*()` when rebuilt (§3).
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
| `product` `Built` | Catalog | `name` (1–100); `sku` 1–32 characters `[A-Z0-9._-]` starting with a letter or digit, upper-cased, unique per workspace ignoring case (archived products included); `unit_price_cents` 0–2,000,000,000; `description` (≤500); `custom`; `archived_at` (archived, never deleted). `active` is kept equal to "not archived" for the old order code until orders are re-ported (phase 2 step 5), then dropped. Migration `0008_products_archive` (§10) |
| `quote` `Built` | Quote | `number` unique per workspace (shown `QUO-0001`, from `workspace_counter` kind `quote`); `status` `draft`/`sent`/`accepted`/`declined` ("expired" is worked out on read: sent and past its valid-until day); `contact_id` required, `company_id`, `deal_id`, `owner_id` optional (set null); `locale` `en`/`es` (from the contact); `currency` (snapshot of the workspace's); one `tax_rate_bp`; `subtotal_cents`, `tax_cents`, `total_cents` computed on the server; `valid_until` (all-day; default 30 days after sending); `notes`; `sent_at`, `accepted_at`, `declined_at`, `decline_reason`; `custom`; `archived_at`. Migration `0009_quotes` (§10) |
| `quote_line` `Built` | Quote line | `quote_id` (cascade); `position`; `product_id` (set null; null for free-text lines); `description`, `sku`, `unit_price_cents` copied from the catalog when picked; `quantity`; `line_total_cents` |
| `sales_order`, `order_line` `Carried` | Order | Contact + optional company (no longer `customer`, §3); created from an accepted quote or by hand |
| `invoice`, `invoice_line` `Carried` | Invoice | Contact + optional company; numbered on issue (`INV-2026-0001`); adds `partially_paid`; balance = total − confirmed payments |
| `payment` | Payment against an invoice | Amount, date, method (bank transfer, cash, card, other), reference, status **reported** (by customer) → **confirmed** / **rejected**; receipt file |
| `project` | Project | Status planned → active → on hold → completed / cancelled; start/due; contact/company; source deal; portal visible |
| `task`, `activity` `Carried` | Work items, calls, meetings | Gain `project_id`; link to contact/company/deal/custom record |
| `ticket`, `ticket_message` | Support | Number `TCK-0001`; status new → open → waiting on customer → resolved → closed; priority; category; channel; internal notes |
| `kb_category`, `kb_article` | Knowledge base | Title/body per language; draft/published; visibility public / portal / internal; slug |
| `survey`, `survey_invitation`, `survey_response` | Feedback | CSAT/NPS/custom; tokenized invitation links |
| `segment` | Campaign audience | A saved view on contacts, evaluated at send time |
| `campaign`, `campaign_recipient` | Email campaigns | Status draft → scheduled → sending → sent; per-recipient delivery status |
| `workflow`, `workflow_run` | Automation | §11.3 |
| `folder`, `file` | Files and folders | §9 |
| `portal_user`, `portal_session`, `portal_token` | Customer portal auth | §8 |
| `workspace_setting`, `workspace_limit`, `workspace_usage` | Settings and limits | §12 |
| `user_preference` `Built` | A person's display preferences, across workspaces and devices | `calendar_days` (1–14, default 3), `task_due_days` (null = all); only the person reads or changes them (`src/modules/preferences`) |
| `tenant_counter` `Carried` | Document numbering | Per (workspace, kind, year) |

## 7. Customization engine `Planned`

One engine powers custom fields on built-in records **and** custom objects, so
nothing is redone when custom objects arrive.

### 7.1 Custom fields (`Built` for contacts, companies, deals, products and quotes)
**Built:** `src/modules/fields` (`schema.ts` shared rules and `validateCustomValues`; `values.ts` form ↔ stored conversions and display; `fields.server.ts` definitions and `prepareCustom`, which every contact/company write runs). Stored values: money in cents, percent in basis points, dates `YYYY-MM-DD`, choices by their permanent option value; empty values are removed. Unknown keys are dropped; archived fields keep their values (saved records keep them untouched). An option still used by a record can't be removed (rename it instead); turning on `unique` requires existing values to be unique. Keys never collide with built-in JavaScript names (`constructor` becomes `f_constructor`) and values are read as own keys only. Limits: 75 active fields and 300 in total (archived included) per record type. **Known limits (security review):** the unique check and the "option in use" check are check-then-write without a database constraint, so two saves at the same moment can still store a duplicate value or a value whose option was just removed (rare; the next save of that record shows the problem). Changes appear on the timeline as `custom.<key>`. Settings page `/settings/fields` (owner/admin change; everyone reads), with a tab per record type (Contacts, Companies, Deals, Products, Quotes). Types `Built`: text, long text, number, money, percent, date, checkbox, single choice, multiple choice, email, phone, URL. `Later`: date-time, member, record reference (with custom objects), file (with file storage, phase 3). A field's type is fixed once created; conversion with a dry run is `Later`.

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

### 7.3 Saved views (`Built` for contacts, companies, deals, products and quotes, table views)
**Built:** `src/modules/views`: filters on built-in and custom fields with operators by kind (text: contains/is/empty; number, money, percent, date: =, >, <, between, empty; checkbox: checked or not; choices and references: any of, empty), all of which must match (AND); chosen and ordered columns, custom fields included; sort by built-in columns or custom fields (empty values last). The URL holds the state (`filters`, `columns`, `sort`, `dir`, `view`). The server checks every filter against the field definitions (400 otherwise) and builds SQL with bound values only (`filters.server.ts`); numeric custom values are cast only when they are JSON numbers. Views are private or shared; a shared view is changed by its creator or an owner/admin, others can use it or save a copy; unknown columns are dropped when saving; 50 views per member. Deals (phase 2 step 2): filters on name, pipeline, stage, status, company, owner, tag, expected close and created date; columns value, stage, status, contact, company, expected close, tags, owner, created; sort by name, value, expected close or created (default newest first). Products (phase 2 step 3): filters on name, SKU, description, created date and custom fields; columns SKU, price, description, created; sort by name, SKU, price or created (default name A–Z). Quotes (phase 2 step 4): filters on status, company, owner, tag, valid until, created date and custom fields; columns status, contact, company, deal, total, valid until, created; sort by number, total, valid until or created (default newest number first). The deals board (§10) is a mode of the deals page, not a saved view type. Board and calendar view types, and OR between filters, are `Later`. View server functions use `requireWorkspace` + `assertPermission` on the view's own record type (the input-dependent pattern of §11.2), not the fixed `requirePermission` middleware. **Known limits (security review):** the 50-views limit is check-then-insert (a simultaneous save can go one over); shared views of someone who left the workspace stay visible with their name until an owner/admin deletes them; any member who can read a record type can share a view of it.

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
**Built:** `templates/generic.json`, validated at startup (`src/modules/templates/templates.server.ts`). Contacts get a "Profile" group (Source, Preferred contact method, Birthday, LinkedIn); companies a "Profile" group (Industry, Size, Website, Annual revenue); three shared contact views (Customers, Leads to qualify, No company yet), named in the creator's language. Applied when a workspace is created (Better Auth `afterCreateOrganization` and `ensureWorkspace`); a failure is logged and never blocks sign-up. Applying adds only what's missing (fields by key, archived ones included; groups by English label; views by name) and never changes existing content, so workspaces created earlier can add it from Settings → Fields (owners/admins). Template fields keep the template's keys so its views can refer to them. **Pipelines (phase 2 step 1):** the file's `pipelines` list (key, `{ en, es }` name, stages with probability and type, checked with the same stage rules as the server) adds a "sales" pipeline: New lead 10 %, Qualified 25 %, Proposal sent 50 %, Negotiation 75 %, Won, Lost. A pipeline is added only when its key is missing (archived ones count); if a concurrent run already added it (409 and the key now exists), it is skipped; other refusals, such as the pipeline limit, are reported. `templateStatus` reports `pipelinesMissing` and `applyTemplate` returns `added.pipelines`; the template card on Settings → Fields counts them. Categories and the rest join the file with their modules.

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

## 9. Files and folders `Planned`

- **Storage:** private R2 bucket; object key `workspace/<id>/<uuid>`; the original name lives in the database.
- **Folders:** a tree per workspace (shared documents) and an automatic folder per record (contact, company, deal, project, ticket, custom record).
- **Access:** downloads only through an authorized Worker route that checks workspace, permission and — for the portal — contact scope and the file's **shared with customer** flag. Never public URLs.
- **Uploads:** size limit per file (initial 25 MB), allowed types list, per-workspace storage quota (§12); uploads count toward usage.
- **Events:** uploads, deletions and shares appear on the timeline.

## 10. Modules — first version

| Module | First version | Later |
|---|---|---|
| **Contacts & companies** `Built` | Contact-first records, optional company, lifecycle stage, owner, tags, notes, custom fields, timeline, merge duplicate contacts (`Built`, below), CSV import/export (`Built`, below) | Several companies per contact, enrichment, merging duplicate companies (owner decision 2026-11-03) |
| **Deals** `Built` (pipelines and deals, below; the link to projects comes with phase 3) | Several pipelines, board and list, value, expected close, won/lost with a required reason, owner, contact required + optional company, link to project | Forecasts, products on deals |
| **Products** `Built` (below) | Catalog with SKU, price, description, custom fields and saved views; archived, never deleted; a picker for document lines | Price lists, variants, stock |
| **Quotes** `Built` (below; "create order from quote" comes with step 5) | From a deal or contact; catalog lines plus free-text lines; one tax rate; validity; printable page instead of a PDF (§3); send by email; staff mark it accepted until the portal (phase 4) accepts/declines → order | E-signature (partner), versions, discounts (for all documents, §3) |
| **Orders & invoices** `Carried` | Rules from the old app; invoice created from order; numbering on issue; printable page and send by email | Credit notes, recurring invoices |
| **Payments** | Record and confirm payments, partial payments, balances, customer-reported payments | Online payments (partner) |
| **Projects** | Status, dates, owner, contact/company, source deal; tasks, milestones (tasks flagged as milestone), files, notes; portal view | Time tracking, budgets, Gantt |
| **Tasks & calendar** `Carried` | Kanban and calendar from the old app, linked to projects and any record | Recurring tasks, reminders by email |
| **Tickets** | From email, portal or staff; inbox with filters; status, priority, category, assignee; email replies threaded; internal notes; KB suggestions | SLA timers, canned replies |
| **Knowledge base** | EN/ES articles, categories, draft/published, public / portal / internal | Article feedback, versions |
| **Surveys** | CSAT and NPS plus simple question types; send after ticket close (workflow) or by hand; results on the contact | Branching logic |
| **Email campaigns** | Segments, consent and unsubscribe, EN/ES content per recipient language, a few templates, scheduled sending through queues, delivery/open/click stats via Resend webhooks | A/B tests, drip sequences |
| **Workflows** | §11.3 | Visual builder, branches, webhooks |
| **Dashboard & reports** | Home dashboard per module (pipeline value, win rate, open tickets, receivables, overdue); every chart with a table view | Custom reports |
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
| Later modules | Every module that points to contacts must move its rows to the kept contact inside `mergeContacts`' batch when it is built. **Deals do** (phase 2 step 2, `dealsMoved`; no `deal.updated` event on them yet), and so do **quotes** (phase 2 step 4; not counted in the `contact.merged` payload, no `quote.updated` event on them); orders, invoices, projects, tickets and portal access follow |

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
| Archive | Products are archived, never deleted (the old delete is gone), because documents point to them. An archived product can't be edited (409). Archiving sets `active = false` and restoring sets it back, so the old order code keeps working until orders are re-ported (step 5); then `active` is dropped |
| Events | `product.created`, `product.updated` (`changes`; custom fields as `custom.<key>`), `product.archived`, `product.restored`, each in the same `db.batch` as the change. Products are not in `SUBJECT_TYPES`, so they have no tags, notes or record page yet |
| List | `/products`: saved views and filters (§7.3), search over name, SKU and description, active or archived, price column in the workspace currency |
| Picker | `pickProducts`: active products for document line pickers (the old order pages today, quotes in step 4), searched by name or SKU; at most 20 results when searching, 1,000 otherwise |
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
| Accepting | Records the acceptance (`accepted_at`, `quote.accepted`) and returns the deal; the page then offers "Mark deal won", which moves the deal to its pipeline's won stage through `moveDeal` (needs `deal:update`). No order is created yet: "create order from quote" comes with step 5 (§3) |
| Concurrency | Every edit and status change locks the quote row (`SELECT … FOR UPDATE`) and guards its status (and not archived) inside the batch; a failed guard divides by zero → 409 "changed meanwhile", nothing saved. Archive and restore use the same lock and guard. Sending and accepting also check the quote is exactly the version that was read (its `updated_at`), so what is emailed or accepted is what is saved |
| Email limits | Quote emails leave from the app's address, so they are capped: 50 per workspace in 24 hours and 5 per quote (`QUOTE_LIMITS`; 429). "Mark as sent" has no cap. Line breaks are stripped from every email subject |
| Events | `quote.created` (`number`, `dealId`), `quote.updated` (`fields` changed, `lines`, `totalCents`, `custom`), `quote.sent` (`email`), `quote.accepted` (`totalCents`), `quote.declined` (`reason`), `quote.reopened`, `quote.archived`, `quote.restored`, each in the same `db.batch` as the change |
| List | `/quotes`: saved views and filters (§7.3), search by number (`QUO-12`, `12`), contact, company or deal; status filter including expired; active or archived; total value of the matching quotes |
| Quote page | `/quotes/$quoteId`: the editor for drafts (catalog picker via `pickProducts` and free-text lines, live totals); the printable document in the quote's language with "Print / Save as PDF" (`window.print()`; the sidebar, top bar and page controls are `print:hidden`); actions by status; tags, notes, custom fields, timeline |
| Contact and deal pages | A Quotes card lists their active quotes; "New quote" creates a draft from that contact or deal |
| Merge | `mergeContacts` moves the duplicate's quotes to the kept contact inside its batch |
| Shared engine | `quote` is in `OBJECT_KEYS` (custom fields with a "Quotes" tab in Settings → Fields, saved views) and `SUBJECT_TYPES` (tags, notes, timeline) |
| Known limits | Quotes moved by a merge get no event and aren't counted in the `contact.merged` payload. Real email delivery waits for the domain (§19; dev prints to the console, pitfall 9). The contact page loader now calls 7 server functions (§17 pitfall 15) |

Tests: `tests/unit/quotes.test.ts` (9: expiry after the valid-until day, other statuses never expire, 30-day default at 12:00 UTC, totals with tax rounded once and too-large totals refused, line rules, from a deal or a contact, tax range and 100 lines, `QUO-0001` labels, the email in the quote's language with escaped client text) and `tests/integration/quotes.test.ts` (7: per-workspace numbers and language from the contact; server totals and active catalog products; send/accept/decline/reopen only from the right status, once; expired can't be accepted and email needs an address; from a deal with contact, company and the returned deal; merging moves quotes, tags and notes on quotes; no reach across workspaces); the workspace-deletion test in `isolation.test.ts` covers `quote`. The integration tests wait for a recreated `test` branch.

### Navigation (staff app)
Home · **Contacts** (Contacts, Companies, custom objects) · **Sales** (Deals `Built`,
Quotes `Built`, Orders, Invoices, Payments, Products `Built`) · **Work** (Projects, Tasks,
Calendar, Files) · **Service** (Tickets, Knowledge base, Surveys) ·
**Marketing** (Campaigns, Segments) · **Automation** (Workflows) ·
**Settings** (Workspace, Members, Fields & objects, Pipelines, Templates,
Portal, Email, Limits). Modules switched off are hidden.

## 11. Events, timeline and workflows `Planned`

### 11.1 Event log (`Built` for contacts, companies, deals, products and quotes)
**Built:** `src/platform/events.server.ts`: `eventInsert(workspaceId, actor, …)` returns the insert to put in the same `db.batch` as the change; `changedFields(before, after)` produces `{ field: { from, to } }` for `*.updated` events (saving without changes writes no event). Types so far: `<record>.created|updated|archived|restored|tag_added|tag_removed|note_added|note_edited|note_pinned|note_unpinned|note_deleted` for contacts and companies, plus `pipeline.created|updated|archived|restored` (§10), `deal.created|updated|stage_changed|won|lost|reopened|archived|restored` and the tag and note events on deals (§10), `product.created|updated|archived|restored` (§10; `updated` carries `changes`), `quote.created|updated|sent|accepted|declined|reopened|archived|restored` and the tag and note events on quotes (§10), `contact.merged` on both merged contacts (payload `role` `kept`/`duplicate`, `otherId`, `otherName`, `notesMoved`, `tagsMoved`, `dealsMoved`; the kept one adds `taken` and `changes`, the duplicate `cleared`, the unique values it gave up; §10); records created by a CSV import (§10) carry payload `{ source: "import" }` on their `*.created` event (and on the events of companies the import creates). **Known limits (security review, phase 1 step 1):** update events keep the old and new values of changed fields, including email and phone, so erasing a person (§12.4) must also scrub their events; an edit and an archive sent at the same moment can both pass their checks, so an update can land on a just-archived record (rare, harmless, revisit if workflows make it likely).

`event`: `workspace_id`, `type` (e.g. `contact.created`, `deal.stage_changed`,
`invoice.payment_confirmed`, `ticket.closed`), `subject_type` + `subject_id`,
`actor` (member, contact, system or workflow), `payload` (before/after of
changed fields), `created_at`. Written in the same `db.batch` as the change, so
the log never disagrees with the data. Append-only.

### 11.2 Timeline (`Built` for contacts, companies, deals and quotes)
**Built:** `src/modules/records` (tags, notes, timeline for any record type in `SUBJECT_TYPES`). The page shows tags, then notes and events newest first with pinned notes on top, filterable All / Notes / Changes. `*.note_added` and `*.note_edited` events stay in the log but aren't shown (the note itself is). `contact.merged` reads "Merged X into this contact" or "Merged into X"; deal events read "Moved to X", "Marked as won", "Marked as lost: reason" and "Reopened"; quote events read "Emailed to the contact" or "Marked as sent", "Accepted", "Declined: reason", "Back to draft" and "Edited the draft". Permissions: reading follows the record's `read`; tagging, adding notes and pinning need its `update`; only the author edits a note's text; authors or owners/admins (`delete`) delete notes. Checked inside each server function with `assertPermission` (`src/platform/permissions.server.ts`) under the `requireWorkspace` middleware, the pattern custom objects will reuse (§7.4).

Every record page shows its events, notes, emails, tasks, activities, files and
related records' key events, newest first, filterable by kind.

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
admin+; editors can record. Custom roles: `Later`.
**Built:** references are checked when set or changed: an unchanged owner who left the workspace, or an unchanged link to an archived company, doesn't block editing; new links need a current member and an active company. Custom field definitions (`field` permission): owner/admin create/update/delete, every role reads. Contacts and companies: owner/admin full; editor create, read, update; viewer read. Archiving and restoring need `delete` (owner/admin). CSV export needs `read`; CSV import needs `create`, plus `update` when it updates existing records (§10). Merging contacts needs `update` and `delete` (owner/admin); finding merge candidates needs `read` (§10). Pipelines and stages (`pipeline` permission): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor and viewer read (§10). Deals (`deal` permission): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor create, read, update; viewer read; the deal form's contact picker needs `contact:read` (§10). Products (`product` permission, unchanged): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor create, read, update; viewer read; the document line picker needs `read` (§10). Quotes (`quote` permission): owner/admin create, read, update, delete (archiving and restoring need `delete`); editor create, read, update, which includes sending, accepting, declining and "Back to draft"; viewer read; "Mark deal won" after accepting is the deal's own `moveDeal` and needs `deal:update` (§10).

### 12.3 Limits per workspace (initial defaults)
| Resource | Default |
|---|---|
| Contacts + companies | 10,000 |
| Custom records (all objects) | 20,000 |
| File storage / max file size | 1 GB / 25 MB |
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
rows and R2 files.

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
- **Documents:** quotes and invoices render in the contact's language, as a printable page ("Print / Save as PDF" in the browser), not a generated PDF (owner decision 2026-11-03, §3). **Built for quotes:** a quote stores its `locale` (taken from the contact when created, changeable on the draft); the printable document and the quote email use that language whatever the reader's, through `m.*({}, { locale })`.
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
| **2. Sales** (in progress: steps 1–4, pipelines, deals, products and quotes, `Built`) | Pipelines & deals, quotes, orders, invoices, payments | Deal → quote → order → invoice → partial payments → paid, all on the timeline |
| **3. Work** | Projects, tasks & calendar re-ported, files & folders (R2) | A won deal becomes a project with tasks and files; downloads are permission-checked |
| **4. Customer portal** | Email-link sign-in, contact isolation, profile, quotes, invoices & payments, projects, files | A contact accepts a quote and reports a payment; contact-isolation tests prove one contact can't see another's data |
| **5. Custom objects** | Object definitions, records, relationships, permissions, views, portal visibility | An admin creates "Membership" linked to contacts, with views, workflows-ready events and optional portal display |
| **6. Service** | Tickets (email + portal), knowledge base, surveys | An email creates a ticket, replies thread, closing sends a survey, the portal shows tickets and articles |
| **7. Automation** | Workflows, scheduled triggers, run log | "Deal won → create project + task + email" runs once, is logged, and can't loop |
| **8. Marketing** | Segments, consent, unsubscribe, campaigns, delivery stats | A campaign reaches only consented contacts, in their language, within limits |
| **9. AI** | Summaries, drafts, KB suggestions, usage limits | AI features respect permissions and limits; can be switched off |
| **Later** | Online payments, social publishing, WhatsApp/SMS, more templates, custom roles, custom reports, e-signature | — |

### 16.1 Where to resume (handoff, updated 2026-11-03)

**Done:** phase 0; phase 1 (steps 1–6, #11–#20; acceptance check #21). Phase 2 started 2026-11-03 (owner): step 1, pipelines and stages, merged (#22); step 2, deals, merged (#23); step 3, products, merged (#24); step 4, quotes, is built on `feat/phase2-quotes` (§10). Migrations `0000`–`0009` are applied to the Neon `main` branch (dev database); `0006_pipelines` (additive) was applied on 2026-11-03 and verified (2 tables, 3 foreign keys, 2 indexes, other tables' row counts unchanged); `0007_deals` (additive) was applied on 2026-11-03 and verified (1 table, 6 foreign keys, 6 indexes, row counts unchanged); `0008_products_archive` was applied on 2026-11-03 and verified (2 columns; 2 products, none inactive, so the backfill changed nothing). `0009_quotes` (additive: 2 tables, 8 foreign keys, 6 indexes) was applied on 2026-11-03 and verified (row counts unchanged).

**Phase 2 plan (one PR per step):**

| Step | Content | Status |
|---|---|---|
| 1 | Pipelines and stages (§10) | `Built` (#22); integration tests pass on the recreated `test` branch |
| 2 | Deals: list and board, value, expected close, won/lost with a required reason, owner, contact required + optional company; custom fields, views, tags, notes, timeline; `mergeContacts` moves deals; a stage with deals can't be removed or change type | `Built` (#23); integration tests pass (71 in total) |
| 3 | Products rebuilt in the module layout, EN/ES: saved views, custom fields, archive instead of delete, a line picker | `Built` (#24); migration `0008` applied to dev |
| 4 | Quotes: from a deal or a contact, `QUO-0001`, catalog lines (snapshot) plus free-text lines, draft → sent → accepted / declined (expired worked out on read), valid until defaults to 30 days after sending, printable page, send by email; staff mark it accepted until the portal (phase 4); accepting offers to mark the deal won (owner decision, §3) | `Built` (this PR); `validate` passes (97 unit tests); migration `0009` applied to dev; integration tests wait for a recreated `test` branch |
| 5 | Orders and invoices re-ported to contact + optional company: **"create order from quote"** (from an accepted quote, §3), invoice from an order, numbered on issue (`INV-2026-0001`), `partially_paid`, printable page, send by email. Needs the destructive migration that removes the dev demo orders/invoices (ask first, §3) | Next |
| 6 | Payments: editors record, admins confirm or reject; partial payments; balance = total − confirmed; paid at 0; overpayment refused; a `reported` status ready for the portal | Planned |
| 7 | End-to-end acceptance integration test (deal → quote → order → invoice → partial payments → paid), the timeline across the chain, `mergeContacts` moves orders/invoices (quotes already move, step 4) | Planned |

Real email delivery of quotes and invoices waits for the domain (§19); until then emails print to the dev console or reach only the Resend account owner (§17 pitfall 9).

**Phase 1 acceptance check (2026-11-03): met in code and tests.**
- A new workspace gets the template: `src/lib/auth.ts` (sign-up and "New workspace"), `templates.test.ts`.
- A contact with custom fields can be created, filtered, imported, exported: `fields.test.ts`, `views.test.ts`, `csv.test.ts`.
- Isolation tests pass: each module tests that workspace B can't reach A's data. The workspace-deletion test in `isolation.test.ts` now also proves that every phase 1 table (company, contact, tag, record_tag, note, event, field_group, field_definition, saved_view) is emptied with the workspace.
- Not proven yet: nothing has run on the real Workers runtime (deploy waits until the end, §3); the 50-subrequest limit is respected by design (CSV import, merge) but only exercised on Node.

**Next: phase 2 step 5, orders and invoices** re-ported to contact + optional company, including "create order from quote", after step 4 is merged. Before merging step 4: the owner applies migration `0009` (`migration-guard`), the `test` branch is recreated (§17 pitfall 11) and `bun run test:integration` passes; and the owner checks quotes in the browser in EN and ES.

**Later (agreed, not scheduled):** merging duplicate companies the same way (owner decision 2026-11-03, §3).

**Waiting on the owner:**
- recreating the Neon `test` branch from `main` (after migration `0009`), so the step 4 integration tests can run;
- the browser check of quotes (EN/ES: `/quotes` with views, filters, search, the expired status and total; "New quote" from the list, a contact and a deal; the draft editor with catalog and free-text lines and live totals; send by email (the email prints in the dev console) and mark as sent; accept with "Mark deal won", decline with a reason, "Back to draft"; "Print / Save as PDF" in both languages with the app shell hidden; the Quotes tab in Settings → Fields; tags, notes and the timeline);
- the browser check of products (EN/ES: list with views, filters, search, active/archived and the price in the workspace currency; create, edit, archive and restore; a duplicate SKU; the Products tab in Settings → Fields; the product picker on the old order pages);
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
17. The Workers free plan has no cron for this app yet, so time-based states are worked out on read instead of by a job: a quote's "expired" is `sent` plus a past valid-until day (`displayStatus` in `src/modules/quotes/schema.ts`, and the same condition in SQL for the list filter). Never store such a state; keep the TypeScript and SQL versions in step.

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
| 2026-11-03 | Phase 2 step 4: quotes in `src/modules/quotes` (migration `0009`, additive, applied to dev): `quote`/`quote_line` tables and `quote` permission, `QUO-0001` numbers per workspace; `/quotes` (views, search, status incl. expired, active/archived, total value) and the quote page (draft editor with catalog and free-text lines, server-computed totals, printable document in the quote's language, send by email or mark as sent, accept with "Mark deal won", decline with a reason, back to draft, archive); Quotes cards on contact and deal pages; Sales → Quotes; expired worked out on read; status changes locked and guarded in the batch; custom fields, saved views, tags, notes and timeline on quotes; `mergeContacts` moves quotes; `sendEmail`/`escapeHtml` exported, `reply_to`; owner decisions on accepting, sending and no discounts; 9 unit and 7 integration tests (this PR) |
