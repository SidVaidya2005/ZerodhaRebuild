<!-- TEMPLATE (setup-context) — created EMPTY; do NOT fill at initialization.
The agent files constraints here as they arise, deleting this banner before the first entry.
KEEP the > **Role:** blockquote AND the "How this file is maintained" section — both are permanent documentation, not scaffolding. -->

# Standing Constraints

> **Role:** What still binds — the decisions and non-obvious facts that constrain future work, grouped by topic.
> **Read before any decision that might conflict with past work.**
> **Relates to:** receives decisions displaced from `progress-tracker.md` and decisions promoted out of `build-journal.md` at phase checkpoints.

## How this file is maintained

Keep this file **small**. It is the one record read on demand during ordinary work, so every line costs on every session that opens it.
The chronological record of how the build got here lives in `build-journal.md`; this file holds only what is still true.

- **Grouped by topic** (auth, data, payments…), never by date. Add a `##` topic heading when a new one is needed.
- **Holds only what still binds:** decisions that constrain future work, and notes explaining why something non-obvious is the way it is. Never a narrative of what happened — that is the journal's job.
- **Two things feed it,** and both are moves, never copies: the oldest bullet of `progress-tracker.md` → Key Decisions when that section would exceed 10, and each phase's still-binding decisions promoted out of `build-journal.md` at the phase checkpoint.
- **Cite the feature each bullet came from,** e.g. `(F02)`.
- **Deduped on write.** If a new constraint supersedes one already here, replace that bullet in place rather than adding a second bullet on the same topic.
- **Never pruned by age.** Remove a constraint only when it is verifiably dead — reversed by a later decision, or the thing it describes no longer exists. `git` history holds anything removed.

<!-- Filed by topic, newest bullet first within each topic:

## {{TOPIC}}
- {{CONSTRAINT}} ({{FEATURE_REF}})

-->

## Build plan sequencing

- **F07 moves behind F09.** Its verify is a tier-2 pgTAP check and `support_messages` accepts anonymous writes, so it should not ship behind a one-off manual check. Phase 1 closes as 01–06 plus 08; F07 is built once the harness exists. (F08)

- **Every link the public shell points at is stubbed in F03**, including `/auth/login`, so the shell's own verify can pass and F04's "every CTA routes to `/auth/login`" has a destination. Each stub is a heading plus one line of copy, replaced wholesale by F05–F08 and F12. `src/app/page.tsx` moves into `(marketing)/` in the same change — two files claiming `/` would fail the build. (F03)

- **Supabase provisioning is deferred out of F01 to Phase 2.** The free plan caps active projects at two per org and both slots already hold unrelated projects (`NextBnb` active, `SpotifyAgain` paused). F10 already calls for creating and linking the project, so F01 and F10 were duplicating the step. (F01)

- **F07 (Support form) is deferred to Phase 2, after F09.** It needs a `support_messages` migration, and its verify ("signed out, a select returns zero rows") is a tier-2 pgTAP check that F09's harness makes runnable. `support_messages` accepts anonymous writes, so it is the last table that should ship behind a one-off manual check. (F01, resolved F08)
- **There is exactly one Supabase project and it is the real one:** `zerodha-rebuild-dev` / `kefggygenlprjzhiocai` / ap-south-1, in a **separate Supabase account** (`wolfgunblood214@gmail.com's Org`) that the workspace MCP cannot see — the CLI is authenticated by personal access token instead. A second test project was created and deliberately deleted: one project is simpler to operate and cannot silently pause while the other stays warm. (F08, revised 1.00.03)
- **Because of that, tier 3 commits into the production database.** It cannot be avoided — proving two connections cannot both fill an order requires the first to commit. Three guards are mandatory and none is optional: `ALLOW_RACE_TESTS` must be set or `pnpm test:race` exits, seeded rows carry a recognisable prefix, and `afterEach` cleanup runs on failure too. A crashed process can still strand rows; that is the accepted residual risk. (1.00.03)
- **`TEST_DATABASE_URL` must use the session-mode pooler, port 5432.** Tier 3 holds a transaction open across statements; the transaction-mode pooler on 6543 structurally cannot express that. The port is load-bearing. (1.00.03)

## Environment and secrets

- **Environment validation is split across two modules**, deviating from `code-standards.md`'s single `env.ts`, which was updated to match. `env.ts` holds the `NEXT_PUBLIC_*` variables and is safe anywhere; `env.server.ts` carries `import 'server-only'` so a client-side import of the service-role key fails the build instead of throwing at runtime. Validation is forced at boot by `register()` in `src/instrumentation.ts`, which Next.js skips during `next build` — so `build` stays green without secrets while `dev` and `start` fail by name. (F01)

## Dependencies

- **`lighthouse` added as a pinned dev dependency with `pnpm audit:a11y`.** F04's verify commits to a score above 90 and nothing could measure it; F38 needs the tooling regardless, so landing it in Phase 1 means every public page is audited as it ships rather than all at once at the end. (F04)

- **TypeScript is pinned to 6.0.3 and ESLint to 9.39.5, both below their available latest.** `typescript-eslint` refuses to load against the TS 7 API, and `eslint-plugin-react` 7.37.5 crashes on ESLint 10's rule-context API — each breaks `pnpm lint` outright. Re-test both when those upstreams ship support; `architecture.md`'s version table carries the reason. (F01)

- **Dependencies are pinned exactly, with no caret ranges.** Every version in `architecture.md` was verified to equal the current registry `latest`, so the table, the lockfile and `package.json` all agree and can only diverge by a deliberate edit. (F01)

## Security and RLS

- **Supabase grants `anon` and `authenticated` ALL privileges on new public tables by default** — verified on `support_messages`: SELECT, UPDATE, DELETE and TRUNCATE were all present, leaving RLS as the single layer. Revoke and grant back only what a role needs. It is defence in depth, and it turns a silent "affects zero rows" into a hard `42501` that a test can actually assert. (F07B)
- **On a public-write table, prefer a missing grant to a filtering policy.** If a permissive policy is ever added by mistake, the absent grant still refuses. (F07B)

## Testing

- **`supabase test db` requires Docker even with `--db-url`.** It connects to the remote database, *then* shells out to `pg_prove` in a container and dies with `LegacyDockerRunError`. Tier 2 runs through `scripts/run-pgtap.mts` instead: pgTAP's functions return their TAP output as text rows, so executing a suite through `pg` and reading the rows *is* the TAP stream. (F09)
- **The tier-2 runner must fail on a plan mismatch, not only on `not ok`.** A suite declaring `plan(2)` that runs one assertion has a bug, and grepping only for `not ok` calls that a pass. All three failure modes — failed assertion, plan mismatch, SQL error — were observed failing before the runner was trusted. (F09)
- **Tier 3 is gated by `scripts/run-race.mts`, which decides before Vitest starts**, so an un-permitted run never imports `pg` at all. Proven with both controls: guard off, the module never loads; guard on, it does. (F09)
- **Prove a negative with a positive control.** A first attempt at that proof used `console.log` and saw nothing in *either* case, because Vitest suppresses it — an absence that looked like evidence and was not. A filesystem marker gave both halves. (F09)

- **Tier 1 tests run in Vitest's node environment with no jsdom and no Testing Library.** Neither is an approved dependency, and `code-standards.md` scopes tier 1 to pure logic. Component behaviour is proven in the browser, not in a simulated DOM. (F01)

## Theming and design tokens

- **Every text token clears WCAG AA against canvas, surface and surface-elevated in both themes, and `theme-tokens.test.ts` computes the ratios rather than trusting the eye.** The muted tones flip in `.light` and invert relative to dark, because on a light ground "more prominent" means darker. Changing any of these values without running `pnpm test` will go red. (fixed 1.00.01)
- **Measure a theme by loading it, not by toggling the class from script.** Elements with `transition-colors` return stale computed colours after a scripted class change, which fabricates failures that do not exist. Set the stored theme, reload, then measure. (1.00.01)
- **`text-brand` is only legible on dark surfaces, and this is the one contrast failure still open.** Brand yellow is 11–13.5:1 as text on dark and 1.37–1.43:1 on light, because F02's invariant deliberately keeps `--color-brand` byte-identical across themes. Use `text-ink` for figures and headings; reserve brand for CTA *backgrounds* (`bg-brand text-on-brand`), which pass in both. The wordmark and inline prose links still use it — filed against F38 as a design decision. (F06, still open after 1.00.01)
- **Lighthouse cannot audit the 404**: it returns `ERRORED_DOCUMENT_REQUEST` for any non-200 document. That page is verified structurally and by measured contrast instead. (F08)
- **`pnpm audit:a11y` only ever sees the dark theme.** A clean Lighthouse score is not evidence the light theme is accessible; the contrast assertions in `theme-tokens.test.ts` are what cover it. (F06)
- **The marketing footer is `bg-surface`, not DESIGN.md's always-light `#fafafa`.** `--color-surface` already *is* `#fafafa` in the light theme, so the source system's value is reached through the token rather than hardcoded, and in dark it reads as the elevation step the flat-colour-block philosophy calls for. An always-light token pair would exist only to break the theme contract. (F03)

- **Mobile nav is the shadcn `sheet` primitive, and the theme toggle moves into the public header.** Sheet is Radix Dialog — already installed, no new dependency — and brings focus trap, Escape handling and scroll lock rather than leaving all three to F38. `ThemeToggle` is promoted from `app/dev/styleguide/` to `src/components/ThemeToggle.tsx` as app-level chrome; DESIGN.md's `top-nav-dark` lists it in the right-side cluster. (F03)

- **`--color-muted` is for links, captions and column headers — never for running paragraph copy**, which uses `--color-body`. DESIGN.md scopes it that way, and the misuse also fails WCAG AA: muted is 3.64:1 on the dark surface and 4.34:1 on white. `--color-muted-strong` does not fix it (lighter, so it helps dark and hurts light at 2.84:1); a real fix needs `.light` overrides for both muted tokens and belongs to F38. (F04)
- **Inline links inside a text block carry a persistent underline**, deviating from DESIGN.md's `text-link` ("no underline by default"). WCAG 1.4.1 forbids identifying a link by colour alone, and Lighthouse's `link-in-text-block` catches it. Nav and footer-column links are not in a text block and keep the hover-only underline. (F04)
- **Every `dark:` utility is stripped from added components.** Tailwind v4's built-in `dark:` variant is bound to `prefers-color-scheme`, so a leftover `dark:` class responds to the visitor's OS rather than this project's theme class — a live bug, not inert code. A grep guard enforces it. (F02)

## Formatting and display

- **Two money formatters, not one with flags.** `formatCurrency` always renders ₹ and 2dp; `formatSignedCurrency` renders an explicit +/− where the sign carries meaning. `Intl.NumberFormat('en-IN')` produces Indian digit grouping natively, so nothing is hand-rolled. (F02)

## shadcn/ui

- **The shadcn CLI changed shape: `init -b radix -t next -p nova --css-variables -y`.** It now picks between Base UI, Radix and React Aria, and prompts for a style preset that `-y` does not skip. `shadcn` is also a *runtime* dependency shipping `shadcn/tailwind.css`. Resolves the standing TODO in `library-docs.md` → shadcn/ui. (F02)

- **shadcn's token vocabulary is bridged onto this project's, never merged.** A `@theme inline` block maps shadcn's names onto our palette so `shadcn add` keeps working, while project code keeps using `bg-canvas` / `text-muted` / `border-hairline`. `--color-muted` is the one real collision — shadcn means a *surface* by it, this project means the *text* grey — and it is resolved in this project's favour, with `--color-muted-foreground` defined to the same value and `bg-muted` hand-fixed on add. (F02)

## Marketing site

- **FAQ disclosure is native `<details>`/`<summary>`.** Zero JavaScript, works before hydration and with JS off, and keyboard operation, focus handling and screen-reader semantics come from the browser instead of being hand-written and then audited at F38. (F07)

- **Slice A ships no contact form at all**, pointing unanswered questions at the repository's issue tracker. A dead "coming soon" form is worse than none, and this way Slice B adds the form rather than replacing a placeholder. (F07)

- **The three honesty sections divide by purpose, not by subject.** Home carries price provenance only; About carries the Real / Simulated inventory; `/legal` carries the consequences and the divergences from a real broker, because a notice has to stand alone. About links to Legal rather than restating it. (F05)

- **The About page's stack table renders from a typed `src/lib/stack.ts` guarded by a bidirectional drift test.** Every `installed` row's version must equal `package.json`'s, and every `planned` row's package must be absent from it — so upgrading a dependency without touching the page fails the suite, and so does installing a planned package without flipping its row. (F05)

- **Packages `architecture.md` commits to but later phases install render as "planned"**, neither omitted nor given an invented version. A third of the stack lands in Phases 2–5, and faking those versions would be the same overclaim the provenance badge exists to prevent. (F05)

- **All external links go through a shared `ExternalLink`** carrying `target="_blank" rel="noreferrer"` and an sr-only "opens in a new tab". This turns the recurring `rel="noreferrer"` requirement into a grep for raw `target="_blank"` outside one file. (F05)

- **The home page documents all four provenance states and says plainly that `LIVE` never appears in this build.** `PROVIDER_IS_REALTIME` is `false` for all three providers, so a quote can only badge `DELAYED`, `SIMULATED` or `STALE`. The feature tile drops "live NSE prices" for "real NSE prices, honestly delayed", and `build-plan.md`'s own F04 wording was corrected in the same change — architecture invariants outrank a build-plan feature. (F04)

- **The hero is typographic — no mock terminal UI.** It is what the build plan specifies, and F40 can screenshot the finished terminal, which beats a hand-built fake and avoids maintaining a second UI until the real one exists. (F04)

- **The simulator disclaimer is dismissible and remembered, with no flash.** A blocking inline script in the root layout reads `localStorage` and stamps `data-disclaimer="dismissed"` on `<html>` before first paint; CSS hides the strip off that attribute. The same technique `next-themes` already runs here, and it keeps the `(marketing)` layout a Server Component — only the close button is a client island. (F03)

## Charges and the trading contract

- **The home page quotes no charge rates.** CNC vs MIS is explained as settlement versus 15:20 square-off, shorting rules, and the no-leverage point from `trading-contract.md` §1. §3 still carries a TODO that every rate needs a dated source before F06, and a second copy on the home page would be a second thing to keep in sync. Rates live on `/pricing` only. (F04)

- **`trading-contract.md` §3 had three things wrong, all corrected against Zerodha's published charge list on 2026-08-21.** NSE exchange transaction charge was stale at 0.00297% and is 0.00307%; the DP charge is ₹15.34 **inclusive** of GST, not "₹15.34 + 18% GST", which would have double-charged GST on every CNC sell; and DP is charged once per **scrip per day** in reality. This unblocks F06 and F22. (F06)

- **DP is charged once per sell order in this simulator — a deliberate divergence, documented in F08's simplifications.** Per-scrip-per-day would make `execute_order` query the user's same-day trades inside the locked transaction and give account reset another case to handle. (F06)

- **`charge_breakdown` splits DP into `dp_charge` ₹13.00 with its ₹2.34 GST rolled into `gst`**, so every rupee of GST sits in one key and `gst` never changes meaning depending on whether a DP charge was involved. The pricing page still shows ₹15.34, footnoted, because that is the number on a real contract note. (F06)

- **GST is computed on unrounded sub-components and rounded once**, resolving an ambiguity §2 left open. §13's sweep grep is also extended to charge terms — it matched only margin and P&L identifiers, so it could not detect drift caused by a §3 rate edit. (F06)

## Next.js behaviour

- **A Server Component throw renders nothing server-side; the boundary appears on hydration.** `curl` shows an empty body and a 500, which looks like the white screen the criterion forbids — the check only means something in a browser. Proven with a temporary throwing route, then deleted. (F08)
