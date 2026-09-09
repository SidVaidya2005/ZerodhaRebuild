# In-flight state

> Everything settled lives in `context/`. This file holds only what has no home there.

## In flight

- **Phase 4 checkpoint is part-run** — state and remaining steps are in `progress-tracker.md` Current Status. Two things block it, both on the 15:20 sweep: tier 3's square-off suites and identities 7/9/10.
- **Six files uncommitted** (tip `5.31.02`): the `NO_HOLDING` fix + its new SQL-reading drift guard in `order-copy.{ts,test.ts}`, the 120s budget on `margin.parity.test.ts`, and doc edits to `constraints.md`, `library-docs.md`, `trading-contract.md`.
- The always-read budget passes at **~39,926 / 40,000** — only ~74 tokens of headroom, so the next constraint bullet will likely fail `pnpm context:cost`.
- The `pnpm dev` server does not survive unattended; restart it before any browser verification.

## Tried and rejected

- **Making `execute_order` never reject a flip's closing leg — impossible, do not retry.** It requires filling the close and rejecting the open, i.e. a partial fill, which §1 forbids. The contract only ever guaranteed pure covers and square-offs; §6 now says so.
- Giving `place_order` a `p_at` seam — rejected on security: it is granted to `authenticated`, so any signed-in user could trade outside market hours.
- Hiding the provenance badge or theme toggle to fit 375px — the badge carries the honesty summary and the toggle is the only theme control below `lg`. The wordmark went instead.
- Clicking a watchlist B/S button by CSS coordinate — hits the right element and does nothing; clicking **by element ref** works.

## Open questions

- **Fix the flip's spurious rejection?** On a fill crossing zero, `transfer_margin_to_position` tests the shortfall against `available_cash` *before* the closing leg's `SELL_CREDIT` is posted, so a flip whose own proceeds would cover it is rejected anyway. Fix is to hoist the SELL closing settlement above the reservation retirement — traced and safe, but it needs a migration reproducing ~400 lines of `execute_order`, changes ledger row ordering on every SELL close (defensible under §7), and wants new tier-2 flip coverage. Undecided.
