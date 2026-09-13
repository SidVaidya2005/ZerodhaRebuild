# Running ZerodhaRebuild locally

Everything operational lives here so the README can stay a shop window.

## Prerequisites

- **Node 26** (see `.node-version`) and **pnpm 11**
- A **Supabase project**. There is no Docker requirement — the database test tier connects to the
  remote project directly.

## Setup

```bash
git clone https://github.com/SidVaidya2005/ZerodhaRebuild.git
cd ZerodhaRebuild
pnpm install

cp .env.example .env.local        # then fill in the values below

pnpm supabase link --project-ref <your-project-ref>
pnpm supabase db push             # applies all 51 migrations
pnpm supabase gen types typescript --linked > src/types/database.ts
pnpm seed                         # instruments + the NSE holiday calendar

pnpm dev                          # http://localhost:3000
```

Two more steps before sign-in works:

1. **Enable Google** as an auth provider in the Supabase dashboard, and add
   `http://localhost:3000/auth/callback` to its allowed redirect URLs.
2. **Deploy the scheduled job** if you want prices to move:
   `pnpm supabase functions deploy market-tick`, then schedule it with `pg_cron`. Without it the
   terminal renders fine but nothing ticks.

## Environment variables

Names only — every value is yours to supply, and none is committed.

| Variable | Used by | Secret |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser, server and proxy Supabase clients | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the same three clients | no |
| `NEXT_PUBLIC_SITE_URL` | the OAuth `redirectTo` for `/auth/callback` | no |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` and the Edge Function | **yes** |
| `TWELVE_DATA_API_KEY` | optional; the chain skips the provider when unset | **yes** |
| `TEST_DATABASE_URL` | test tiers 2–4; **session pooler, port 5432** | **yes** |
| `ALLOW_RACE_TESTS` | set to run tier 3, which commits to the real database | no |

Two traps worth knowing before they cost you an afternoon:

- **`NEXT_PUBLIC_*` is inlined at build time.** Setting one on the host without rebuilding changes
  nothing. A deployed instance carrying `NEXT_PUBLIC_SITE_URL=http://localhost:3000` renders every
  page correctly and passes its health check, and only sign-in is broken — so `instrumentation.ts`
  refuses to boot rather than let that ship silently.
- **`TEST_DATABASE_URL` must use the session-mode pooler on port 5432.** Tier 3 holds a transaction
  open across statements, which transaction-mode pooling on 6543 structurally cannot express.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | run locally at `localhost:3000` |
| `pnpm build` / `pnpm start` | production build / serve it |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | ESLint / `tsc --noEmit` / Prettier |
| `pnpm test` | tier 1 — Vitest logic tests, no database |
| `pnpm test:db` | tier 2 — 26 pgTAP suites (RLS, grants, constraints, functions) |
| `pnpm test:race` | tier 3 — two-connection concurrency tests; **commits to the real database** |
| `pnpm test:parity` | tier 4 — proves the TypeScript charge estimator and the Postgres calculator agree exactly |
| `pnpm test:all` | all four tiers |
| `pnpm seed` | instruments and the NSE holiday calendar |
| `pnpm audit:a11y` / `pnpm audit:a11y:axe` | Lighthouse / axe-core accessibility audits |
| `pnpm audit:overflow` | fails if any route scrolls sideways at 375, 768, 1024, 1280 or 1440px |
| `pnpm capture:screenshots` | regenerates the README screenshots |
| `pnpm supabase db push` | apply migrations |
| `pnpm supabase functions deploy market-tick` | deploy the scheduled job |

The audits and the screenshot capture need a **running server**, and the terminal-facing ones need a
session: copy `document.cookie` from a signed-in tab into `OVERFLOW_GUARD_COOKIE`. They fail rather
than skip without it, so a green run never means "we quietly checked half the app".

## Deployment

Render (free web service, Singapore — the nearest region to Supabase's ap-south-1) plus hosted
Supabase. `render.yaml` carries the blueprint, with every secret marked `sync: false` so nothing is
committed.

`/api/health` returns build and database status, and 503 when Postgres is unreachable. It reads
through a `security definer` function returning a boolean and a timestamp rather than a table grant,
because `anon` can read no table in this schema and must not be given one.

Expect a slow first load: a free instance spins down after 15 minutes idle and takes a few seconds to
wake. The market keeps ticking regardless — that work is in `pg_cron`, not in the web process.
