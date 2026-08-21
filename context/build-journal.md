<!-- TEMPLATE (setup-context) — created EMPTY; do NOT fill at initialization.
The agent appends an entry after each completed feature and compacts at phase checkpoints, deleting this banner before the first entry.
KEEP the > **Role:** blockquote AND the "How this file is maintained" section
— both are permanent documentation, not scaffolding. -->

# Build Journal

> **Role:** The dated record of how the build got here — one entry per completed feature.
> **Append after every completed feature**; **compact at every phase checkpoint.**
> **Do not read this file at session start.** Open it only to reconstruct one specific feature's history; the rules that still bind live in `constraints.md`.

## How this file is maintained

This file grows for the life of the project and is **not** part of the session read order.
Nothing here is required to make a decision — anything that still constrains future work gets promoted to `constraints.md`, which is the file consulted during ordinary work.
That separation is what keeps the cost of knowing "what binds" from growing with the length of the build.

- **Append a dated entry after every completed feature**, under the current phase: decisions made, gotchas hit, verification results.
- **Compact at every phase checkpoint, never continuously.** When a phase closes:
  1. **Promote** anything from that phase that still binds into `constraints.md`, filed under its topic.
  2. **Collapse** the phase's per-feature entries into a handful of summary bullets.
  3. **Drop every `Verified:` line** — it has done its job once the next feature passes.
- Only the current phase keeps full per-feature detail. Earlier phases stay compacted, newest first.

Compaction is recoverable: this file is committed, so `git` history holds every detail ever removed.
Compact confidently.

<!-- Newest phase first. Entry format — repeat per completed feature:

## Phase {{N}} — {{PHASE_NAME}}

### Feature {{NN}} — {{FEATURE_NAME}}  *(YYYY-MM-DD)*
- Decision: …
- Gotcha: …
- Verified: …

At that phase's checkpoint, the whole phase collapses to:

## Phase {{N}} — {{PHASE_NAME}} *(compacted)*
- {{SUMMARY_BULLET}} (F{{NN}}–F{{NN}})

-->

## Phase 2 — Data Foundation & Auth

### Feature 09 — Test harness  *(2026-08-21)*
- **The spike failed, which was the point of running it first.** `supabase test db --db-url` connects to the remote database and *then* dies with `LegacyDockerRunError` — the CLI shells out to `pg_prove` in a container regardless of where the database lives. The fallback the build plan pre-authorised became mandatory. pgTAP itself installed cleanly (1.3.3), so only the *runner* was ever the problem.
- Decision: tier 2 runs through `scripts/run-pgtap.mts`. No TAP library is involved — pgTAP's functions **return their output as text rows**, so executing a suite through `pg` and collecting the rows in order *is* the TAP stream.
- Decision: written in TypeScript with **no new runner dependency**. Node 26 strips types natively, so `node scripts/run-pgtap.mts` runs directly; `tsx` would have been a dependency for one file. Used the `.mts` extension rather than adding `"type": "module"` to `package.json`, which would have changed module resolution for the whole project to silence one warning.
- Decision: pgTAP enabled by a **tracked migration** — the project's first. With one project that installs a test-only extension into production, which is the lesser problem: an untracked extension the tests silently depend on means a fresh database looks healthy right up until the suite runs.
- Decision: `pnpm db:push:test` dropped. One database means one push command, and a second script reaching the same place under a name referring to a test project that no longer exists is a trap.
- Decision: tier 2 ships a **smoke suite only**. No schema exists yet, so `01-rls.sql` and friends would assert nothing; they belong to F10/F11, which create the tables they police. What this feature had to prove is that the runner works — including that it fails.
- Gotcha: **the F05 stack drift guard fired in the wild.** Installing `pg` made `stack.test.ts` fail with *"pg is now installed — flip its stack.ts row to 'installed' and give it a version"*. The bidirectional half of that test — the one checking `planned` rows are genuinely absent — earned itself here, four features after it was written.
- Gotcha: first install pinned `pg@8.16.3`, below the registry latest, contradicting both `architecture.md`'s table and F01's exact-latest convention. Corrected to 8.23.0 before committing.
- Gotcha: `supabase migration new` hung past the 120s timeout, but **had already written the file** before hanging. Worth knowing before someone assumes it failed and re-runs it.
- Gotcha, and the most instructive one: **a first attempt to prove the tier-3 guard proved nothing.** Instrumenting `helpers.ts` with `console.log` showed no marker with the guard off — but also none with the guard *on*, because Vitest suppresses console output. An absence that looked like evidence. A filesystem marker gave both halves: guard off, `pg` never loads; guard on, it does. **Prove a negative with a positive control**, now in `constraints.md`.
- Verified **by falsification, three ways**: a failing `ok(false, …)` exits non-zero and names the file and assertion; `plan(5)` with two assertions reports "planned 5 assertions, ran 2"; and a SQL error surfaces the Postgres message. All reverted, tier 2 green.
- Verified: tier 2 reaches a real database — `00-smoke.sql` asserts `has_extension('extensions','pgtap')`, which cannot pass without one — and is idempotent: two consecutive runs produce identical output, the `begin/rollback` wrapper doing its job.
- Verified: tier 3 opens **two distinct backends** (`pg_backend_pid()` differs), and uncommitted work in one is invisible to the other until commit — the property that makes a lock race expressible here and impossible in a single pgTAP session.
- Verified **cleanup survives failure**: a temporary test that committed a row and then threw still left `to_regclass('public.zr_race_scratch') is null` true. Then deleted.
- Verified: `pnpm test` is still 93 and picks up neither tier; `grep -rn "from 'pg'" src/` is empty; `pnpm supabase db push` applied one migration and a re-push reports up to date; `pnpm test:all` chains all three with tier 3 announcing its skip loudly.
- Verified: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm format:check` all exit 0.

## Phase 1 — Foundation & Public Site *(compacted 2026-08-21 at the Phase 1 checkpoint)*

Eight features plus three unnumbered fixes: the Next.js scaffold, the token system, the public shell,
and the six public pages. Closed with `lint`, `typecheck`, `test` (93), `test:db` (2 files), `build`
and `format:check` all green, every public route scoring 97–100 on Lighthouse, and no horizontal
overflow in either theme at 375px or 1440px. Everything below that still constrains future work has
been promoted to `constraints.md`; this is the shape of how it got there.

### The checkpoint itself (1.00.06)  *(2026-08-21)*
- Verification: `lint`, `typecheck`, `test` (93 / 5 files), `test:db` (2 files, 8 assertions), `build` and `format:check` all exit 0. Lighthouse: `/`, `/about`, `/pricing`, `/support`, `/legal` all **100**; `/auth/login` **97**. All seven public routes walked at 375px and 1440px in both themes — `scrollWidth === innerWidth` everywhere, the theme class flips on load, and every route has one `h1`, labelled navs and header/main/footer landmarks except the login stub.
- **Finding — four statements described a model already replaced, and no sweep could have caught them.** `trading-contract.md` §13 exists because money rules are restated across four files; the same restatement problem exists outside money with no equivalent guard. `architecture.md` and `code-standards.md` both still named `supabase test db` as the tier-2 runner F09 had proven unusable, and `architecture.md` still had the support form built on react-hook-form in both its stack table and its data-flow diagram. All four corrected here.
- **Finding — `code-standards.md`'s Server Action rule and the shipped support action have disagreed since F07B.** The rule says every action takes `input: unknown`; `submitSupportMessage` takes `(previousState, formData)` because `useActionState` supplies them. F07B corrected the *dependency list* to say react-hook-form is not used there, but never the shape rule. The exception is now written into the rule, scoped so it cannot be used as a general escape hatch.
- **Finding — `/auth/login` renders no `<main>`**, which is the whole of its 3-point Lighthouse gap and the only reason a public route is below 100. It is F03's placeholder, so the fix is filed against F12 with the audit named, rather than patched into a file F12 replaces wholesale.
- Gotcha: **`resize_window` still does not resize** — the same macOS fullscreen behaviour F03 hit. Solved differently this time: headless Brave driven through the `puppeteer-core` that already ships under `lighthouse`, with `setViewport` giving an exact 375px. No new dependency, and the throwaway script stayed in the scratchpad. Both workarounds are now in `constraints.md`.
- Gotcha: measuring only `document.documentElement.scrollWidth` would have called `/about` and `/pricing` clean without proving anything about *why* — both hold tables wider than the viewport. Recording the offending elements alongside the page width is what shows the tables scroll inside their own containers rather than pushing the page.
- **Finding — the tier-3 gate failed open, and it is the only thing protecting the one production database.** `run-race.mts` tested `if (!env.ALLOW_RACE_TESTS)` against a raw string, so `ALLOW_RACE_TESTS=0` — the natural way to write "off" — is truthy and **ran tier 3, committing rows**. Only an empty or absent value skipped. Separately the gate read `.env.test.local` alone and never `process.env`, so `ALLOW_RACE_TESTS=1 pnpm test:race` (the form `CLAUDE.md` documents, and the only one available in CI) printed SKIPPED and exited 0 — a skip silently passing inside `test:all`, which is the exact failure that file's header claims to prevent. Fixed with an explicit allowlist (`1`/`true`/`yes`/`on`) and `process.env` layered over the file. Falsified both ways: with the file saying `0` the gate refuses and names the offending value; with `ALLOW_RACE_TESTS=1` on the command line over that same file, it opens. The positive control ran against a copy with the spawn replaced by a marker, so proving the gate opens did not itself write to the database.
- Same file: the env parser dropped keys containing digits and would have folded a trailing `# comment` into the connection string — and `.env.example` actively encourages annotating that line. Rewritten to handle quotes, comments, CRLF and digits.
- **Finding — the support form rejected pasted email addresses.** `z.email()`'s pattern is anchored, so `' ada@example.com '` failed as malformed; `name` and `message` were both trimmed and `email` was not. The first fix was wrong and the check caught it: `z.email().trim()` still rejects, because the chain validates before it trims. `z.string().trim().pipe(z.email())` is what actually reorders them. **Neither reading the code nor `pnpm test` would have shown this** — it took running the parse.
- **Finding — `submitSupportMessage`'s comment claimed a role the action will not use.** It said an unauthenticated request runs as `anon` "and the pgTAP suite proves that role can insert and do nothing else". True today, but the server client carries request cookies, so from F12 a signed-in visitor inserts as `authenticated` — a role the policy names and the suite has never exercised. Comment corrected; the missing test arm is filed against F12.
- Disagreed with one review finding, on evidence: the §2 reconciliation test was called tautological and unable to detect the violation it is named after. It does restate the implementation's expression, which is a real weakness — but it computes its sum from the *returned, rounded* breakdown, so switching `total` to a rounding of the unrounded sum would still fail it wherever the two diverge. Recorded against F22 as "prove it by independent expectation", not as inert.
- Compaction: `build-journal.md` 243 → 85 lines. Feature 09's entry was moved out to a new Phase 2 section — it is a Phase 2 feature that was built early, so it keeps full detail while Phase 1 collapses around it.

- **The stack was pinned by measurement, not intention** (F01). TypeScript 7 and ESLint 10 both break `pnpm lint` through transitive plugins, so both sit one major below latest with the reason recorded in `architecture.md`. Every other version was verified equal to the registry `latest` before being pinned exactly. Supabase provisioning was deferred out of F01 into Phase 2, which is what later forced F07 to split.
- **Environment validation split into a public and a server module** (F01), with `register()` in `src/instrumentation.ts` forcing it at boot — so `dev` and `start` fail by name on a missing variable while `build` stays green on a machine holding no secrets. Both halves were observed failing before being trusted.
- **shadcn's token vocabulary is bridged onto this project's, never merged** (F02). A `@theme inline` block keeps `shadcn add` working while project code keeps its own names, the built-in `dark:` variant is redefined to match nothing, and a set of grep guards proves no bridge name, `dark:` class or raw hex has leaked. The bridge's real cost is that every `shadcn add` needs a manual pass for raw `var(--x)` names this project does not define.
- **The public shell stubbed every link target it points at** (F03), including `/auth/login` nine features before F12 builds it, so each feature's verify had somewhere to resolve. The disclaimer strip is dismissed before first paint by a blocking script writing a `data-` attribute, which keeps the `(marketing)` layout a Server Component.
- **The three honesty sections divide by purpose, not subject** (F04, F05, F08): Home carries price provenance, About carries the Real / Simulated inventory, `/legal` carries the consequences and the divergences from a real broker. Home documents all four provenance states and says plainly that `LIVE` never appears in this build — and `build-plan.md`'s own F04 wording was corrected to match, because an architecture invariant outranks a build-plan feature.
- **Content that restates a fact renders from the source of that fact** (F04, F05, F06). The opening balance comes from `OPENING_BALANCE`, the About stack table from a typed module guarded by a bidirectional drift test, and the pricing worked example from the real charge estimator — each proven by falsification, changing the source and watching the page change.
- **Checking the charge table against Zerodha's published list found three errors in `trading-contract.md` §3** (F06): a stale exchange transaction rate, a DP charge that would have double-charged GST on every delivery sell, and a per-order-versus-per-scrip divergence now disclosed on `/legal` rather than left silent. §13's sweep could not have caught any of them — it matched margin and P&L identifiers only — so it grew a second, charge-specific grep.
- **The muted text tokens had never cleared WCAG AA in either theme** (F04 → F08 → 1.00.01). Found by measuring rather than by eye, fixed across both themes at once, and now machine-checked: `theme-tokens.test.ts` computes every foreground/surface ratio and asserts the prominence ordering on the worst surface. Diagnosing it cost more time than fixing it, because a scripted theme toggle fabricates failures that do not exist.
- **One contrast failure is deliberately still open**: `text-brand` on light surfaces, which follows structurally from F02's invariant that brand colour is byte-identical across themes. Filed against F38 as a design decision, with the measured ratios.
- **The 404 carries the full public chrome and the error boundary carries none** (F08), for opposite reasons — a mistyped URL wants the nav; a failed subtree wants to depend on as little as possible. `PublicShell` was extracted to serve both, because an unmatched URL never enters the route group.
- **F07 was split into two slices rather than renumbered** (F07). Planning found the contact form needs most of Phase 2's foundation, and inserting a feature number would have invalidated every journal and commit reference already written. Slice A shipped the help content with zero JavaScript; Slice B shipped the form after F09 existed to police it.
- **Two Supabase projects became one, deliberately** (1.00.03), which is what makes tier 3 commit into the real database and why its three guards are mandatory. Four documents mandated the second project and all four had to be reconciled in the same change.
- **The contact form is the first RLS policy in the project, and writing the test first is what exposed the real defect** (F07B): Supabase grants `anon` ALL privileges on new public tables, so RLS was the single layer on the only publicly-writable table. Revoking and granting back INSERT alone turned a silent "affects zero rows" into an assertable `42501`. Falsified three ways.
- **The recurring lesson of the phase was that a passing check is not evidence unless it has been seen to fail.** Every guard in Phase 1 — the `server-only` build error, the brand-token invariant, the stack drift test, the pgTAP runner, the tier-3 gate, the RLS policy — was observed failing before it was trusted, and three of them were found broken that way. The counter-examples cost the most time: a Lighthouse 100 while the tap targets were 20px, an absence of `console.log` output that looked like proof and was not, and a `curl` 500 that looked like a white screen and was not.
