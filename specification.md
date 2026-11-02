# Specification — Generic CRM

> Living specification for **Generic CRM**, a multi-tenant CRM for small
> businesses. Every section is a plan until it is marked **Built**. **Read it
> before changing anything; update it in the same PR as any change it
> describes** (`spec-keeper` agent).
>
> Status: **Draft 1 — design only, phase 0 not started** · 2026-11-02 ·
> repository `https://github.com/Fuema/generic_crm` (private).
>
> **Current code = a copy of the reference project** `my-tanstack-app`
> (`https://github.com/Fuema/bun_tanstack_neon_cloudflare`, frozen; its
> `specification.md` documents that code) with its starter leftovers removed.
> Phase 0 (§5) is in progress and turns it into this design.

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
| 2026-11-02 | **Business pages are translated when they are rebuilt** (phases 1–3), not in phase 0: only the pages that are kept (auth, app shell, account, workspace) and the auth emails are converted now |

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

### Planned source layout
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
| Better Auth setup: email + verification, social, 2FA (TOTP, email, backup codes), passkeys, rate limits, session rules, password policy, HIBP | `customer` table and pages → rebuilt as Contacts & Companies (phase 1) |
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
- **i18n setup** (EN/ES) for every string ported. **Setup done:** Paraglide compiles `messages/*.json` (`bun run i18n:compile`, also run by `typecheck` and the Vite plugin); `src/server.ts` wraps every request in `paraglideMiddleware` (it is the Worker entry in `wrangler.jsonc`); `<html lang>` follows the locale; `LanguageSwitcher` saves the choice in the `PARAGLIDE_LOCALE` cookie and reloads; `check:i18n` in `validate` fails on missing or empty translations. **Converted:** all guest/auth pages (sign-in, sign-up, forgot/reset password, two-factor, verify email), their components, the auth validation messages in `src/lib/schema.ts` (Zod messages are `{ error: () => m.…() }` and password rule labels are functions, so server-side checks answer in the request's language) and the Better Auth error messages (`authErrorMessage`). **Still to convert in phase 0:** app shell, account and workspace pages, auth emails. **Not converted on purpose:** business pages and their schemas (customers, products, orders, invoices, tasks, calendar, projects, dashboard): they are written with `m.*()` when rebuilt (§3).
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
| `contact` | A person | Email unique per workspace (case-insensitive, nullable); `lifecycle_stage`; `owner_id`; `company_id` (one primary company in v1); `locale`; `email_consent` (status, source, date); `custom` |
| `company` | An organization | Name; domain unique per workspace (nullable); owner; `custom` |
| `tag`, `record_tag` | Free labels on any record | Per workspace |
| `note` | Free text on any record | Author, pinned flag; appears on the timeline |
| `event` | Event log | §11 |
| `field_group`, `field_definition` | Custom fields engine | §7 |
| `object_definition`, `custom_record`, `relationship_definition`, `record_link` | Custom objects | §7.4 |
| `saved_view` | Saved filters/columns/sort | §7.3 |
| `pipeline`, `pipeline_stage` | Pipelines for deals (and later tickets/projects) | Stage has order, probability, type `open`/`won`/`lost` |
| `deal` | Opportunity | Value (cents), stage, expected close, contact/company, owner, lost reason |
| `product` `Carried` | Catalog | SKU unique per workspace; price in cents; active flag |
| `quote`, `quote_line` | Quote | Number `QUO-0001`; status draft → sent → accepted / declined / expired; valid until; lines snapshot catalog data |
| `sales_order`, `order_line` `Carried` | Order | Created from an accepted quote or by hand |
| `invoice`, `invoice_line` `Carried` | Invoice | Adds `partially_paid`; balance = total − confirmed payments |
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
| `tenant_counter` `Carried` | Document numbering | Per (workspace, kind, year) |

## 7. Customization engine `Planned`

One engine powers custom fields on built-in records **and** custom objects, so
nothing is redone when custom objects arrive.

### 7.1 Custom fields
- **Where:** contacts, companies, deals, quotes, projects, tickets, products, and every custom object.
- **Field types:** text, long text, number, money, percent, date, date-time, single choice, multiple choice, checkbox, email, phone, URL, member (user), record reference (contact/company/custom record), file.
- **Definition** (`field_definition`): object key, immutable `key`, `label` and `help` as `{ en, es }`, type, options (with EN/ES labels), required, default, unique (text/email only), group, position, **portal visibility** (hidden / read-only / editable by the contact), archived flag.
- **Values** live in the record's `custom` JSONB, keyed by the field `key`.
- **Validation:** the server builds a Zod schema from the definitions at request time and validates every write. The client form uses the same builder; the server never trusts it.
- **Lists:** custom fields appear as optional columns and filters in tables and saved views. GIN index on `custom`; expression indexes added for fields that are filtered often.
- **Changing a field:** renaming labels is free; the key never changes; deleting **archives** the field (values kept, hidden) and can be restored; changing type is allowed only when values convert cleanly (e.g. text → single choice with matching options); a dry run reports what would fail.

### 7.2 Field groups
Named, ordered sections on a record page ("Membership", "Billing details"),
with EN/ES labels, collapsible, optionally visible in the portal.

### 7.3 Saved views
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

### 7.5 Templates
A template is a **JSON file** in `templates/` with: modules on/off, vocabulary,
field groups and fields, custom objects, pipelines and stages, ticket
categories, starter KB articles, email and survey templates, saved views and
dashboard. Applied once, when a workspace is created; everything stays editable.
**Generic** is the only template in v1. Future industry templates add data, not code.

### 7.6 Limits (initial defaults, tune later)
Custom objects per workspace: 10 · fields per object: 75 · field groups per
object: 15 · saved views per member: 50 · choice options per field: 100.

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
| **Contacts & companies** | Contact-first records, optional company, lifecycle stage, owner, tags, notes, custom fields, timeline, merge duplicates, CSV import/export | Several companies per contact, enrichment |
| **Deals** | Several pipelines, board and list, value, expected close, won/lost with reason, link to contact/company/project | Forecasts, products on deals |
| **Quotes** | From a deal or contact; catalog lines; tax; validity; PDF; send by email; accept/decline in the portal → order | E-signature (partner), versions |
| **Orders & invoices** `Carried` | Rules from the old app; invoice created from order; numbering; PDF and send by email | Credit notes, recurring invoices |
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

### Navigation (staff app)
Home · **Contacts** (Contacts, Companies, custom objects) · **Sales** (Deals,
Quotes, Orders, Invoices, Payments, Products) · **Work** (Projects, Tasks,
Calendar, Files) · **Service** (Tickets, Knowledge base, Surveys) ·
**Marketing** (Campaigns, Segments) · **Automation** (Workflows) ·
**Settings** (Workspace, Members, Fields & objects, Pipelines, Templates,
Portal, Email, Limits). Modules switched off are hidden.

## 11. Events, timeline and workflows `Planned`

### 11.1 Event log
`event`: `workspace_id`, `type` (e.g. `contact.created`, `deal.stage_changed`,
`invoice.payment_confirmed`, `ticket.closed`), `subject_type` + `subject_id`,
`actor` (member, contact, system or workflow), `payload` (before/after of
changed fields), `created_at`. Written in the same `db.batch` as the change, so
the log never disagrees with the data. Append-only.

### 11.2 Timeline
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
- **Documents:** quotes and invoices render in the contact's language.

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
| **0. Foundation** | Port and clean up (§5), `workspace_id` everywhere, i18n, tests, deploy, verified email domain | `validate` + tests pass; app deployed; sign-in, 2FA, passkeys, invitations work live in EN and ES |
| **1. CRM core** | Contacts & companies, custom fields + groups, saved views, event log + timeline, notes, tags, Generic template, import/export | A new workspace gets the template; a contact with custom fields can be created, filtered, imported, exported; isolation tests pass |
| **2. Sales** | Pipelines & deals, quotes, orders, invoices, payments | Deal → quote → order → invoice → partial payments → paid, all on the timeline |
| **3. Work** | Projects, tasks & calendar re-ported, files & folders (R2) | A won deal becomes a project with tasks and files; downloads are permission-checked |
| **4. Customer portal** | Email-link sign-in, contact isolation, profile, quotes, invoices & payments, projects, files | A contact accepts a quote and reports a payment; contact-isolation tests prove one contact can't see another's data |
| **5. Custom objects** | Object definitions, records, relationships, permissions, views, portal visibility | An admin creates "Membership" linked to contacts, with views, workflows-ready events and optional portal display |
| **6. Service** | Tickets (email + portal), knowledge base, surveys | An email creates a ticket, replies thread, closing sends a survey, the portal shows tickets and articles |
| **7. Automation** | Workflows, scheduled triggers, run log | "Deal won → create project + task + email" runs once, is logged, and can't loop |
| **8. Marketing** | Segments, consent, unsubscribe, campaigns, delivery stats | A campaign reaches only consented contacts, in their language, within limits |
| **9. AI** | Summaries, drafts, KB suggestions, usage limits | AI features respect permissions and limits; can be switched off |
| **Later** | Online payments, social publishing, WhatsApp/SMS, more templates, custom roles, custom reports, e-signature | — |

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

## 18. Workflow

- Branch per change from `main`; never commit to `main`; `commit-and-push` skill with two confirmations; PR link and description for the owner (`gh` not installed).
- Definition of done: `bun run validate` (typecheck, Biome, build, bundle check, **tests**, **i18n keys**) + a browser check for UI changes.
- Ask before applying migrations; update this specification in the same PR.
- Subagents (`project-navigator`, `validator`, `resource-builder`, `migration-guard`, `security-reviewer`, `spec-keeper`) are copied from `my-tanstack-app` and updated for the module layout, `workspace_id`, custom fields, the portal's contact isolation and i18n.

## 19. Open questions

1. **Product name and domain** (needed for the portal address, email sender and passkeys).
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
| 2026-11-02 | i18n: auth pages, auth validation and Better Auth error messages in EN/ES (120 keys); owner decisions: zero-cost plan, business pages translated when rebuilt (this PR) |
