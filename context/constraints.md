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

- **Supabase provisioning is deferred out of F01 to Phase 2.** The free plan caps active projects at two per org and both slots already hold unrelated projects (`NextBnb` active, `SpotifyAgain` paused). F10 already calls for creating and linking the project, so F01 and F10 were duplicating the step. (F01)

- **F07 (Support form) conflicts with that deferral and is unresolved.** It sits in Phase 1 and needs a `support_messages` migration, so Phase 1 cannot complete without a Supabase project existing. Decide this when F07 is architected — do not discover it mid-build. (F01)

## Environment and secrets

- **Environment validation is split across two modules**, deviating from `code-standards.md`'s single `env.ts`, which was updated to match. `env.ts` holds the `NEXT_PUBLIC_*` variables and is safe anywhere; `env.server.ts` carries `import 'server-only'` so a client-side import of the service-role key fails the build instead of throwing at runtime. Validation is forced at boot by `register()` in `src/instrumentation.ts`, which Next.js skips during `next build` — so `build` stays green without secrets while `dev` and `start` fail by name. (F01)

## Dependencies

- **TypeScript is pinned to 6.0.3 and ESLint to 9.39.5, both below their available latest.** `typescript-eslint` refuses to load against the TS 7 API, and `eslint-plugin-react` 7.37.5 crashes on ESLint 10's rule-context API — each breaks `pnpm lint` outright. Re-test both when those upstreams ship support; `architecture.md`'s version table carries the reason. (F01)

- **Dependencies are pinned exactly, with no caret ranges.** Every version in `architecture.md` was verified to equal the current registry `latest`, so the table, the lockfile and `package.json` all agree and can only diverge by a deliberate edit. (F01)

## Testing

- **Tier 1 tests run in Vitest's node environment with no jsdom and no Testing Library.** Neither is an approved dependency, and `code-standards.md` scopes tier 1 to pure logic. Component behaviour is proven in the browser, not in a simulated DOM. (F01)

## Theming and design tokens

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
