# In-flight state

> Everything settled lives in `context/`. This file holds only what has no home there.

## In flight

- Nothing mid-feature. F31 and F32 are ticked and committed; the next act is the **Phase 4 checkpoint**, whose first three steps are real work, not record-keeping.
- The `pnpm dev` server does not survive unattended; restart it before any browser verification.
- Two live MIS positions (ITC +20, INFY −3) were open at 14:20 IST on 2026-09-09 and will have been auto-squared at 15:20. If the checkpoint wants live identity-7 evidence, `trades.is_auto_squareoff` and `cron.job_run_details` hold it — but `net._http_response` keeps only ~6 hours.

## Tried and rejected

- Stubbing `market_state` to force a fill — **moot**, and never done. The item only ever wanted the next trading day, which its own Verify block says. Check whether a blocker is still real before designing around it.
- Giving `place_order` a `p_at` seam — rejected on security: it is granted to `authenticated`, so it would let any signed-in user trade outside market hours.
- Hiding the provenance badge or the theme toggle to fit 375px — rejected: the badge carries the honesty summary, and the toggle is the only theme control on mobile (`AvatarMenu` has none). The wordmark went instead.
- Clicking a watchlist B/S button by CSS coordinate — landed on the correct element and did nothing; the same button clicked **by element ref** worked. Prefer refs to coordinates in this app.

## Open questions

- None. The mobile-navigation gap found this session is confirmed, not open — it is filed in `constraints.md` under Accessibility and assigned to F37. It has not been added to `build-plan/phase-6.md`, which is `architect`'s to shape.
