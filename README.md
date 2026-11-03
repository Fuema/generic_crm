# Generic CRM

A multi-tenant CRM for small businesses: contacts and companies, sales
(pipelines, quotes, invoices, payments), projects, a customer portal, custom
fields and custom objects, in English and Spanish.

Built on TanStack Start, Cloudflare Workers, Neon Postgres and Better Auth.

## Status

**Phase 1 (CRM core) in progress.** Phase 0 (foundation, English/Spanish,
tests) is done. Built so far:
- contacts and companies, with tags, notes and a timeline;
- custom fields and saved views;
- the Generic template;
- CSV import and export.

Next: merging duplicate contacts. The full design and the phase plan are in
[`specification.md`](specification.md); §16.1 says where work resumes. Modules
not rebuilt yet are still the reference project's
([`bun_tanstack_neon_cloudflare`](https://github.com/Fuema/bun_tanstack_neon_cloudflare)).
Production deploy is planned for the end of the project, on free tiers only.

## Getting started

1. `bun install`
2. Create `.env.local` from `.env.example`, pointing to **this project's own** Neon database.
3. `bun run dev` (http://localhost:3000)

## Working on it

Read `specification.md` and `CLAUDE.md` first. Every change goes through a
branch and a pull request; `bun run validate` must pass. These commands check
the project:
- `bun run validate`: typecheck, Biome, translation keys, unit tests, build, and the browser-bundle check.
- `bun run test:integration`: integration tests against the schema-only Neon
  `test` branch, with `TEST_DATABASE_URL` set to that branch's connection string.
