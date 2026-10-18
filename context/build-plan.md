# Build Plan

> **Purpose:** The build order, divided into phases and numbered features.
> Start here, then read the feature you are working on in its phase file. Do not load unrelated phases.
> `project-overview.md` defines the scope; `progress-tracker.md` records what is done and what comes next.

## Core Principle

**Build the UI with mock data first, then connect its real behaviour. Verify each step before starting the next.**
A feature must produce something you can inspect in a browser or check in a test. Money logic follows
a different order: write and test the Postgres function before building the UI that calls it. A
screenshot cannot tell you whether a balance is correct.

## The phases

Each phase has its own file. Owners can use the table to follow the delivery order; developers and
AI agents can go straight to the feature they need. The former single file exceeded 2,000 lines and
cost about 41k tokens to read, mostly for work already shipped. Keep the files separate.

| Phase                            | Features | File                    |
| -------------------------------- | -------- | ----------------------- |
| 1 — Foundation & Public Site     | 01–08    | `build-plan/phase-1.md` |
| 2 — Data Foundation & Auth       | 09–16    | `build-plan/phase-2.md` |
| 3 — Terminal Shell & Live Prices | 17–21    | `build-plan/phase-3.md` |
| 4 — Trading Engine               | 22–29    | `build-plan/phase-4.md` |
| 5 — Portfolio Pages              | 30–35    | `build-plan/phase-5.md` |
| 6 — Polish & Ship                | 36–40    | `build-plan/phase-6.md` |

**Use `progress-tracker.md` for current status.** This index does not repeat the completion list.
The phase files retain their implementation plans, acceptance criteria, dated results and unresolved
follow-ups. Read dated results as records of those checks, not proof that the current build passes.
Later decisions in the authoritative context files may supersede an older plan; follow `CLAUDE.md`
when resolving a conflict.

## How this file is maintained

- Before building a feature, use the `architect` skill to replace its `**Verify:**` block with
  confirmed acceptance criteria. Edit the phase file itself; do not maintain a separate copy.
- **Never delete or prune completed phase files.** At the checkpoint, move decisions that still constrain
  future work to `constraints.md`; keep the account of what happened in `build-journal.md`. Read an
  old phase only when the task needs its feature specification or acceptance criteria.
- Add a new phase as a separate file and a row in the table. Do not put its features in this index.
- The consistency search in `trading-contract.md` §13 includes `context/build-plan/*.md`. It must
  continue to find money rules in every phase file if this directory layout changes.
