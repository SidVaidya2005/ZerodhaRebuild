# Build Plan

> **Role:** The ordered plan — phases and numbered features to build, in sequence.
> **Read this index, then the one phase file you are building.** Never read a phase you are not in.
> **Relates to:** features come from `project-overview.md`; status tracked in `progress-tracker.md`.

## Core Principle

**UI first with mock data, then wire the real logic, and never leave a step unverifiable.**
Every feature ships something you can open in a browser or assert in a test before the next one
starts. Money-moving logic is built bottom-up in the opposite direction — the Postgres function and
its tests come before the UI that calls it — because a wrong balance is invisible in a screenshot.

## The phases

Each phase lives in its own file so a session loads the one it is working in and nothing else. The
plan was one 2,000-line file until it was split; reading all six phases to build one feature cost
~41k tokens per session, most of it entries for features already shipped.

| Phase | Features | File |
| ----- | -------- | ---- |
| 1 — Foundation & Public Site | 01–08 | `build-plan/phase-1.md` |
| 2 — Data Foundation & Auth | 09–16 | `build-plan/phase-2.md` |
| 3 — Terminal Shell & Live Prices | 17–21 | `build-plan/phase-3.md` |
| 4 — Trading Engine | 22–29 | `build-plan/phase-4.md` |
| 5 — Portfolio Pages | 30–35 | `build-plan/phase-5.md` |
| 6 — Polish & Ship | 36–40 | `build-plan/phase-6.md` |

**Which phase is current, and which features are done, is `progress-tracker.md`'s answer, not this
file's** — it is not repeated here, because two places holding the same status is how they drift.

## How this file is maintained

- A feature's `**Verify:**` block is rewritten in place by the `architect` skill before that feature
  is built. Edit the phase file, never a copy.
- A finished phase's file is **not** deleted and **not** pruned. It is simply not read again: its
  still-binding decisions are promoted to `constraints.md` at the phase checkpoint, and its narrative
  lives in `build-journal.md`.
- Adding a phase means adding a file and a row above — never appending to this index.
- `trading-contract.md` §13's sweep greps `context/build-plan/*.md`, so a money rule restated in any
  phase file is still caught. Keep that glob correct if the layout changes again.
