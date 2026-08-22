# ZerodhaRebuild

A paper-trading platform with Zerodha/Kite's product model and the design system in `context/DESIGN.md`:
a public marketing site plus a live NSE terminal where
Google-authenticated users trade ~200 stocks with ₹1,00,000 of simulated cash. No real money anywhere.

## Project context lives in `context/`

The `context/` folder is the source of truth for this project. **Read it before writing any code**, and keep it current as you work. Read in this order:

1. **`context/project-overview.md`** — what the product is, who it's for, what's in and out of scope.
2. **`context/architecture.md`** — stack, folder structure, system boundaries, data model, and the **invariants you must never violate**.
3. **`context/trading-contract.md`** — how money, orders, positions and charges behave. **Authoritative for anything involving money.**
4. **`context/code-standards.md`** — the rules every change must follow.
5. **`context/library-docs.md`** — project-specific usage patterns for each library (read the relevant section before using one).
   **`context/DESIGN.md`** — the visual system the tokens derive from. Read it before building any UI; the tokens themselves and the three project deviations live in `library-docs.md` → Tailwind.
6. **`context/build-plan.md`** — the ordered phases and features to build.
7. **`context/progress-tracker.md`** — what's done, in progress, and next.

**When two documents disagree**, resolve in this order — higher wins, and fix the loser in the same change rather than leaving the contradiction:
`trading-contract.md` (money only) → `project-overview.md` scope → `architecture.md` invariants → `code-standards.md` → the current feature in `build-plan.md` → `library-docs.md` → any code example. If the conflict is not resolvable this way, stop and ask.

## Standing rules

- **Read `context/` first.** Never assume — verify against `project-overview.md` and `architecture.md`.
- **Obey the invariants** in `architecture.md`. They are non-negotiable.
- **Follow `code-standards.md`** on every change.
- **For libraries**, follow the authority order: **Context7** (`resolve-library-id` → `query-docs`) → skills (per the project instruction file, `CLAUDE.md`/`AGENTS.md`) → `context/library-docs.md` → official docs via web search. Never write an API shape from training-data memory — if none of those answers it, ask.
- **Stay in scope.** Build only what the current feature in `build-plan.md` requires.
- **Use logical commits.** Keep each commit focused, easy to review, and in a working state whenever possible.
- **Number every commit subject `<phase>.<feature>.<n>`**, followed by a plain lowercase imperative summary — `2.05.03 wire profile form submit`. `<phase>` and `<feature>` are the current phase and feature numbers from `build-plan.md`, feature zero-padded to two digits. `<n>` is a **counter that restarts at `01` for every feature**: read the most recent commit (`git log -1 --format=%s`) — if it carries the same `<phase>.<feature>`, add one to its `<n>`; otherwise start again at `01`. Pad `<n>` to two digits.
- **Reserve feature `00` for work that isn't a numbered feature.** Phase checkpoints, chores, and fixes outside a feature use `<phase>.00.<n>` (`2.00.01 phase 2 checkpoint`); anything before Phase 1 begins uses `0.00.<n>` (`0.00.01 init repo + context docs`). Feature `00` has its own per-phase counter, restarting at `01` in each phase.
- **Ask before committing.** Never create a commit without explicit user approval, and never add coauthors unless the user explicitly requests them.
- **Checkpoint every phase.** Before moving to the next phase, run the relevant verification commands, inspect the phase diff, check for obvious bugs/regressions, confirm code consistency, update `progress-tracker.md`, compact `build-journal.md` (see below), and record any follow-up work.
- **Update `progress-tracker.md`** after every completed feature — tick the box, **overwrite** Current Status (never append to it; it holds only the latest state), and add the single most important decision to the top of "Key Decisions". That section holds the 10 most recent decisions, newest first — when adding an 11th, file the oldest under its topic in `context/constraints.md`.
- **Read `context/constraints.md`** before any decision that might conflict with past work. It is grouped by topic and holds only what still binds, so it stays short and cheap to read.
- **Append to `context/build-journal.md`** after each completed feature — a dated entry with the decisions made, gotchas hit, and verification results. **Never read this file at session start**; it grows for the life of the project. Open it only to reconstruct one specific feature's history.
- **Compact `build-journal.md` at phase checkpoints**, never continuously — that file's own `How this file is maintained` section carries the procedure. Never remove a constraint that still binds.

## Project-specific rules

- **Money math belongs in Postgres.** Never compute a balance, average price, charge total, or realised P&L in TypeScript and store it. TypeScript formats numbers; Postgres calculates them.
- **`trading-contract.md` governs every money decision.** Fill pricing, rounding, charges, margin, ledger rows, P&L and reset are all decided there — do not re-derive any of them, and do not invent a rule it does not state. **After editing it, run the sweep in its §13** and reconcile every hit; derived statements in other files do not update themselves.
- **Order fills happen only inside `execute_order`.** Not in a Server Action, not in a route handler, not in the Edge Function.
- **RLS is the security boundary**, not application code. Every user-owned table is scoped to `auth.uid() = user_id`.
- **Never label simulated data as live.** Every quote stores `provider` and `provider_ts`; the source badge is **derived at render time**, never stored, and every rendered price exposes its provenance.
- **This project moves no real money.** Do not add a payment SDK, a broker API client, or any deposit flow — simulated or otherwise.

## Commands

- `pnpm install` — install dependencies
- `pnpm dev` — run the app locally at `localhost:3000`
- `pnpm build` — production build
- `pnpm start` — serve the production build (Render's start command)
- `pnpm lint` — ESLint
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm audit:a11y` — Lighthouse accessibility score against a **running** server (`pnpm start` first)
- `pnpm test` — tier 1: Vitest logic tests, no database
- `pnpm test:db` — tier 2: pgTAP suites in `supabase/tests/`, run by `scripts/run-pgtap.mts`. **Not** `supabase test db`, which needs Docker even against a remote database (F09)
- `pnpm test:race` — tier 3: two-connection concurrency tests. **Commits to the real database**; needs `ALLOW_RACE_TESTS` set
- `pnpm test:parity` — tier 4: proves the TypeScript charge estimator and the Postgres calculator agree exactly. Read-only, so it is not gated — but it needs `TEST_DATABASE_URL` and **fails rather than skips** without it
- `pnpm test:all` — all four tiers
- `pnpm supabase db push` — apply migrations to the linked project
- `pnpm supabase gen types typescript --linked > src/types/database.ts` — regenerate DB types (run after every migration)
- `pnpm supabase functions deploy market-tick` — deploy the scheduled job

## Environment notes

- **This machine has Brave, not Google Chrome.** `chrome-launcher` finds no install, so `pnpm audit:a11y` points `CHROME_PATH` at Brave's binary with a `${CHROME_PATH:-…}` override. Brave is Chromium, so Lighthouse drives it unchanged.
- **No Docker on this machine** — and `supabase test db` needs it **even with `--db-url`**: it connects to the remote database first, then dies with `LegacyDockerRunError`. Tier 2 therefore runs through `scripts/run-pgtap.mts`. Everything runs against the **one hosted project** (`zerodha-rebuild-dev`, `kefggygenlprjzhiocai`, ap-south-1). There is deliberately no separate test project. **Tier 3 commits into that database**, so `pnpm test:race` is gated behind `ALLOW_RACE_TESTS` — see `code-standards.md` → Testing. Free projects pause after a week idle.
- **A blank white page on `localhost:3000` is HTTP 431, not a render bug.** Cookies ignore port, so other Supabase projects run on `localhost` leave `sb-<ref>-auth-token` chunks that push the request header past Node's 16 KB limit; the request dies before Next.js sees it, with no log line. Check `document.cookie.length` first. (F12)
- **Render free tier has no cron jobs and no background workers**, and spins down after 15 minutes idle. All scheduled work lives in Supabase `pg_cron` (1-minute minimum) calling the `market-tick` Edge Function.
- **Next.js 16 renamed `middleware.ts` to `proxy.ts`** with a named `proxy` export, running on the Node.js runtime only.
- Upstream quote endpoints are undocumented and rate-limited. Verify a live response with `curl` before writing or changing a parser.

## Tooling available

- **Context7 MCP** — `resolve-library-id` then `query-docs`. First stop for any library API question.
- **Supabase MCP** — inspect tables, apply migrations, query logs, check advisors against the linked project.
- **`architect` skill** — run before building a non-trivial feature; it replaces that feature's `**Verify:**` block with confirmed criteria.
- **`code-review` skill** — run at phase checkpoints over the phase diff.
