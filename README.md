# Generic CRM

A multi-tenant CRM for small businesses: contacts and companies, sales
(pipelines, quotes, invoices, payments), projects, a customer portal, custom
fields and custom objects, in English and Spanish.

Built on TanStack Start, Cloudflare Workers, Neon Postgres and Better Auth.

## Status

**Design stage.** The full design is in [`specification.md`](specification.md).
The code is still an unmodified copy of the reference project
([`bun_tanstack_neon_cloudflare`](https://github.com/Fuema/bun_tanstack_neon_cloudflare));
phase 0 turns it into this design. Until then `bun run dev` and `bun run build`
fail on purpose (spec §5).

## Getting started (after phase 0)

1. `bun install`
2. Create `.env.local` from `.env.example`, pointing to **this project's own** Neon database.
3. `bun run dev` (http://localhost:3000)

## Working on it

Read `specification.md` and `CLAUDE.md` first. Every change goes through a
branch and a pull request; `bun run validate` must pass.
