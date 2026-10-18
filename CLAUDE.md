# ZerodhaRebuild

ZerodhaRebuild is a paper-trading platform based on Zerodha's public website and Kite terminal.
Users sign in with Google and practise trading roughly 200 NSE stocks with ₹1,00,000 of simulated
cash. Prices are simulated too. The visual design is defined in `context/DESIGN.md`.

This file tells contributors and AI agents how to work in the repository. For a product introduction
and local setup, start with `README.md`. For brief explanations of trading and engineering terms,
see `context/project-overview.md` → Terms used in these docs.

## Project context lives in `context/`

The context files define the product, its technical rules, and its build history. Read the six core
files below at the start of a development session, in this order. Then read the references relevant
to your task. Loading the entire folder adds more than 100,000 tokens, mostly from completed work.
A documentation review may need a broader read; routine development does not.

1. `context/progress-tracker.md`: current work, completed features, and the next step.
2. `context/constraints.md`: decisions and lessons that still apply. Its seven topic references
   live in `context/constraints/`; read those when the table below calls for them.
3. `context/project-overview.md`: what the product does, who it is for, and its scope.
4. `context/architecture.md`: the stack, component boundaries, price sources, authentication,
   and invariants. An invariant is a rule that must remain true after every change.
5. `context/code-standards.md`: conventions every code change must follow.
6. `context/trading-contract.md`: the authoritative rules for cash, orders, positions, and charges.

Read additional files as follows:

| When you are…                                                                               | Read                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting or continuing a numbered feature                                                   | That feature's section in `context/build-plan/phase-<n>.md`. Routine feature work does not need other phases or the whole phase file.                          |
| Changing the schema, writing a migration, or adding a file                                  | `context/architecture/data-model.md` for tables, columns, views, and folders; `context/constraints/security.md` for permissions and database-constraint traps. |
| Writing a Server Action, Postgres function, Supabase client, subscription, or Edge Function | `context/architecture/patterns.md` for examples and data flows; `context/code-standards/boundary-patterns.md` for the rules behind them.                       |
| Writing or debugging a test                                                                 | `context/code-standards/testing.md` and `context/constraints/testing.md`.                                                                                      |
| Using a third-party library                                                                 | The relevant section of `context/library-docs.md`, after checking Context7 as described below.                                                                 |
| Building or restyling a UI                                                                  | `context/DESIGN.md`. Where its values differ from the shipped tokens in `library-docs.md` → Tailwind, the shipped tokens win.                                  |
| Checking behaviour in a browser or interpreting an automated audit                          | `context/constraints/verification.md` for checks that can produce misleading results.                                                                          |
| Running a Supabase migration, type generation, or function deployment                       | `context/constraints/supabase-cli.md`.                                                                                                                         |
| Changing money calculations, orders, or a Postgres money function                           | `context/constraints/trading.md` for rationale, order-entry rules, and safe locking.                                                                           |
| Changing a displayed price, quote store, source label, or quote provider                    | `context/constraints/market-data.md`.                                                                                                                          |
| Changing a public `(marketing)` page                                                        | `context/constraints/marketing.md`.                                                                                                                            |
| Investigating a past feature's decisions                                                    | That feature's entry in `context/build-journal.md`. Do not load the journal at session start.                                                                  |

To find one feature's section, run `rg -n '^### ' context/build-plan/phase-4.md`, then read the
relevant lines with `sed -n '<start>,<end>p'`.

### When documents disagree

Use this order, from highest authority to lowest:

1. `trading-contract.md` for anything involving money.
2. `project-overview.md` for product scope.
3. The invariants in `architecture.md`.
4. `code-standards.md`.
5. The current feature in `build-plan/phase-<n>.md`.
6. `library-docs.md`.
7. Code examples.

Correct the lower-priority statement in the same change. Reference files must follow the
architecture invariants. If this order does not resolve the conflict, ask the user.

## Standing rules

- Read the core files first, then the relevant references. Check scope and architecture before
  making assumptions. Follow the invariants and code standards on every change.
- For library APIs, check Context7 (`resolve-library-id` → `query-docs`), then applicable skills
  from `CLAUDE.md`/`AGENTS.md`, then `context/library-docs.md`, then official documentation via
  web search. Do not invent an API from memory. Ask if those sources do not answer the question.
- For feature work, build only what the feature named in `progress-tracker.md` requires.
- Keep each commit focused, reviewable, and working where possible. Ask before committing;
  explicit user approval is required. Add coauthors only when the user requests them.

### Commit numbering

Start each commit subject with `<phase>.<feature>.<n>`, followed by a lowercase imperative summary:
`2.05.03 wire profile form submit`. Use the current phase and feature from `progress-tracker.md`.
Pad the feature and counter to two digits.

Read the latest subject with `git log -1 --format=%s`. If it has the same phase and feature,
increment its counter; otherwise start at `01`. The counter restarts for each feature.

Use feature `00` for checkpoints, chores, and fixes outside a numbered feature, such as
`2.00.01 phase 2 checkpoint`. Before Phase 1, use `0.00.<n>`. Feature `00` has a separate counter
for each phase, starting at `01`.

### Keeping project records current

- After completing a feature, tick its checkbox in `progress-tracker.md` and replace Current Status
  with the latest state. Do not append previous statuses. Add the most important decision to the
  top of Key Decisions, which holds at most ten entries. Move the oldest entry into the relevant
  constraints topic when an eleventh is added.
- Keep `context/constraints.md` brief: one or two sentences per bullet explaining the rule and its
  reason. Put rules for a specific type of work in `context/constraints/<topic>.md`. Detailed
  examples and investigation history belong in the journal.
- After completing a feature, append a dated journal entry with decisions, problems encountered,
  and verification results. Read the journal only when investigating a specific feature.
- At each phase checkpoint, run the relevant checks, review the phase diff for bugs and consistency,
  update the tracker, and record follow-ups. Compact the journal using its own maintenance procedure
  before moving to the next phase. Compact only at checkpoints; preserve every rule that still applies.

## Project-specific rules

- Postgres calculates stored balances, average prices, charges, and realised profit or loss.
  TypeScript formats values and may show the clearly labelled estimates allowed by the trading contract;
  it must never calculate a monetary value for storage, including an estimate.
- Follow `trading-contract.md` for fill prices, rounding, charges, margin, ledger entries, P&L, and
  resets. Do not invent extra rules. After editing it, run its §13 consistency sweep and reconcile
  every match in the other files.
- Only the Postgres function `execute_order` may fill an order.
- Row Level Security (RLS) enforces account isolation in the database. User-owned tables must be
  scoped to `auth.uid() = user_id`; application checks alone do not provide this protection.
- Every quote stores `provider` and `provider_ts`. Derive its source label when rendering rather
  than storing a freshness label. Every displayed price must expose where it came from; simulated
  prices must never be labelled live.
- No real money moves through this app. Do not add payment SDKs, broker API clients, or deposit
  flows, including simulated deposit flows.

## Commands

| Command                                                               | Purpose and requirements                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                                        | Install dependencies.                                                                                                                                                                                                                                                                                             |
| `pnpm dev`                                                            | Run locally at `localhost:3000`.                                                                                                                                                                                                                                                                                  |
| `pnpm build`                                                          | Build for production.                                                                                                                                                                                                                                                                                             |
| `pnpm start`                                                          | Serve the production build; also Render's start command.                                                                                                                                                                                                                                                          |
| `pnpm lint`                                                           | Run ESLint.                                                                                                                                                                                                                                                                                                       |
| `pnpm typecheck`                                                      | Run `tsc --noEmit`.                                                                                                                                                                                                                                                                                               |
| `pnpm audit:a11y`                                                     | Run Lighthouse accessibility checks against a running server; start it with `pnpm start`.                                                                                                                                                                                                                         |
| `pnpm audit:overflow`                                                 | Check for sideways page scrolling at 375, 768, 1024, 1280, and 1440px. Requires a running server and `OVERFLOW_GUARD_COOKIE` from a signed-in tab's `document.cookie` for terminal routes. Missing cookies fail the check; use `OVERFLOW_GUARD_PUBLIC_ONLY=1` only when deliberately checking public pages alone. |
| `pnpm capture:screenshots`                                            | Regenerate all nine screenshots in `docs/screenshots/`, including the order ticket. Requires a running server and the same signed-in cookie; fails without it. The ticket needs Puppeteer's trusted `page.mouse` input; see `constraints/verification.md`.                                                        |
| `pnpm test`                                                           | Tier 1: Vitest logic tests; no database.                                                                                                                                                                                                                                                                          |
| `pnpm test:db`                                                        | Tier 2: pgTAP suites in `supabase/tests/`, using `scripts/run-pgtap.mts`. Do not substitute `supabase test db`; it requires Docker even for a remote database.                                                                                                                                                    |
| `pnpm test:race`                                                      | Tier 3: concurrent tests using two connections. Writes committed data to the hosted database; requires `ALLOW_RACE_TESTS`.                                                                                                                                                                                        |
| `pnpm test:parity`                                                    | Tier 4: compare TypeScript estimates with Postgres calculations exactly. Read-only; requires `TEST_DATABASE_URL` and fails without it.                                                                                                                                                                            |
| `pnpm test:all`                                                       | Run all four tiers.                                                                                                                                                                                                                                                                                               |
| `pnpm supabase db push`                                               | Apply migrations to the linked project.                                                                                                                                                                                                                                                                           |
| `pnpm supabase gen types typescript --linked > src/types/database.ts` | Regenerate database types after every migration.                                                                                                                                                                                                                                                                  |
| `pnpm supabase functions deploy market-tick`                          | Deploy the scheduled job.                                                                                                                                                                                                                                                                                         |

## Environment notes

- This machine uses Brave rather than Chrome. The accessibility command sets `CHROME_PATH` to
  Brave's binary using a `${CHROME_PATH:-…}` override. Lighthouse works with its Chromium engine.
- There is no Docker. `supabase test db --db-url` still attempts to use Docker and fails with
  `LegacyDockerRunError`, so tier 2 uses the custom runner. All database work uses one hosted project:
  `zerodha-rebuild-dev` (`kefggygenlprjzhiocai`, ap-south-1). There is deliberately no separate test
  project. Tier 3 commits to that database and is gated by `ALLOW_RACE_TESTS`; read
  `code-standards/testing.md` before running it. Free projects can pause after a week without activity.
- If `localhost:3000` shows a blank page, check for HTTP 431 and inspect `document.cookie.length`
  first. Cookies are shared across ports: other Supabase projects can leave `sb-<ref>-auth-token`
  chunks that exceed Node's 16 KB request-header limit. These requests fail before reaching Next.js,
  leaving no application log. (F12)
- Render's free web service sleeps after 15 minutes idle and provides no cron jobs or background
  workers. Supabase `pg_cron` calls `market-tick` at a minimum interval of one minute instead.
- Next.js 16 uses `proxy.ts` with a named `proxy` export in place of `middleware.ts`. It runs only
  on the Node.js runtime.
- Before changing a parser for an upstream quote endpoint, inspect an actual response with `curl`.
  Those endpoints are undocumented and rate-limited.

## Tooling available

- Context7 MCP: look up library APIs using `resolve-library-id`, then `query-docs`.
- Supabase MCP: inspect tables, migrations, logs, and advisors where the linked account is accessible.
- `architect` skill: use before a non-trivial feature to replace its `**Verify:**` block with agreed criteria.
- `code-review` skill: use at phase checkpoints to review the phase diff.
