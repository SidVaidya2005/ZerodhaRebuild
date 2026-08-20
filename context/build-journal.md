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

## Phase 1 — Foundation & Public Site

### Feature 01 — Project scaffold and tooling  *(2026-08-21)*
- Decision: Supabase provisioning deferred out of this feature to Phase 2. The free plan caps active projects at two per org and both slots hold unrelated projects (`NextBnb` active, `SpotifyAgain` paused). F10 already specified creating and linking the project, so F01 and F10 were duplicating the step. **F07 (Support form) is still unresolved** — it is in Phase 1 and needs a `support_messages` migration, so Phase 1 cannot close without a project existing.
- Decision: environment validation split into `src/lib/env.ts` (public, safe anywhere) and `src/lib/env.server.ts` (`import 'server-only'`). `code-standards.md` → Environment Variables was rewritten in the same change, since it named a single module.
- Decision: dependencies pinned exactly, no caret ranges. Every version in `architecture.md` was verified equal to the registry `latest` before pinning.
- Gotcha: **TypeScript 7.0.2 is unusable here.** `typescript-eslint` 8.67.0 refuses to load against the TS 7 API and aborts `pnpm lint` outright. Dropped to TypeScript 6.0.3 and reconciled the `architecture.md` version row. Tracking issue: typescript-eslint#10940.
- Gotcha: **ESLint 10.8.1 is unusable here.** `eslint-plugin-react` 7.37.5 — the newest release, pulled in transitively by `eslint-config-next` — crashes with `contextOrFilename.getFilename is not a function` on ESLint 10's rule-context API. `eslint-config-next` optimistically declares `eslint: >=9.0.0`. Dropped to ESLint 9.39.5; `pnpm peers check` is now clean.
- Gotcha: `create-next-app` refuses a directory holding `context/`, `CLAUDE.md` or `AGENTS.md`, and its template emits its own `AGENTS.md`, `CLAUDE.md` and `README.md`. Scaffolded into a temp directory and rsynced in with those three excluded.
- Gotcha: the generated `.gitignore` uses a bare `.env*`, which would have silently excluded `.env.example`. Added a `!.env.example` negation.
- Gotcha: the generated root layout typed its props as `LayoutProps<"/">`, a global emitted into `.next/types` by a build — so `pnpm typecheck` failed on a clean tree and only passed after `pnpm build`. Replaced with an explicit local props type, removing the hidden ordering dependency.
- Gotcha: `server-only` throws unless resolved under React's `react-server` condition, so Vitest cannot import `env.server.ts`. Aliased it to the package's own `empty.js` in `vitest.config.mts`. This does not weaken the guard — `next build` still resolves the throwing entry for client bundles, which is what the falsifiability check below exercises.
- Gotcha: `next dev` appends a `nextjs-agent-rules` block to `AGENTS.md` and regenerates it on every run, so it is committed rather than reverted. It also points at `node_modules/next/dist/docs/` as the version-accurate Next 16 reference.
- Verified: `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all exit 0; 5 tier-1 assertions pass, not `passWithNoTests`.
- Verified: `pnpm dev` serves `localhost:3000` with HTTP 200 and no warnings in the dev log.
- Verified **by falsification**: a `'use client'` module importing `env.server.ts` fails `pnpm build` with exit 1 and the `server-only` error, naming the full import chain. Reverted, and the build returns to exit 0. The guard was observed failing before being trusted.
- Verified: removing `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` makes the dev server refuse to serve (curl returns 000) with `Invalid public environment variables … → at NEXT_PUBLIC_SUPABASE_URL` — named, not a downstream `undefined`.
- Verified: no `tailwind.config.*` exists; `grep '"\^' package.json` returns nothing; `.env.local` and `.env.test.local` stay untracked while `.env.example` is committed; the 32-directory skeleton matches `architecture.md` → Folder Structure.

