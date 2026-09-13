# Constraints — The public marketing site

> **Reference half of `context/constraints.md`.** Read **before building or changing a page under
> `(marketing)`** — not at session start.
> None of it binds work inside the terminal, which is where most of the build lives.


- **The support form uses React 19's form action and `useActionState`, not react-hook-form**, so it submits and validates without JavaScript. `code-standards.md` carries the exception to its own Server Action shape rule. (F07B)
- **FAQ disclosure is native `<details>`/`<summary>`** — zero JavaScript, and keyboard operation, focus handling and screen-reader semantics come from the browser rather than being hand-written and audited at F38. (F07)
- **`support_messages` carries CHECK length bounds and a honeypot, and volume abuse is deliberately unmitigated.** The publishable key ships in the browser bundle, so bounds cap the damage per request and real rate limiting is out of scope for a portfolio contact form. (F07B)
- **The three honesty sections divide by purpose, not subject.** Home carries price provenance, About carries the Real / Simulated inventory, `/legal` carries the consequences and divergences — because a notice has to stand alone. (F05)
- **The home page documents all four provenance states and marks *two* of them unreachable.** `LIVE` is structural — `PROVIDER_IS_REALTIME` is `false` for all three providers. `DELAYED` is circumstantial: no real provider is wired, so every quote resolves `SIMULATED`. **The chips are hand-written and derive from nothing**, so landing a real provider means flipping `DELAYED` back to `reachable` by hand. (F04, extended 6.00.04)
- **No public copy may describe prices as real, live, or provider-fetched while the chain holds only the simulator.** Eight places did — hero, feature tile, badge vocabulary, the About inventory's *Real* column, the About intro, `/legal`, the support FAQ, and the home page's `description` metadata. The honest framing is that the **instruments** are real NSE symbols and the **prices** are simulated from a real closing price. (6.00.04)
- **The About page's stack table renders from a typed `src/lib/stack.ts` guarded by a bidirectional drift test** — every `installed` row's version must equal `package.json`'s, and every `planned` row's package must be absent from it. Packages later phases install render as "planned", never with an invented version. (F05)
- **All external links go through a shared `ExternalLink`** carrying `target="_blank" rel="noreferrer"` and an sr-only "opens in a new tab", which turns a recurring requirement into a grep for raw `target="_blank"`. (F05)
- **The hero is typographic — no mock terminal UI.** F40 can screenshot the finished terminal, which beats maintaining a hand-built fake. (F04)
- **The simulator disclaimer is dismissible and remembered, with no flash.** A blocking inline script stamps `data-disclaimer` on `<html>` before first paint and CSS hides the strip off that attribute — the same technique `next-themes` already uses, keeping the layout a Server Component. (F03)
- **Mobile nav is the shadcn `sheet` primitive**, which is Radix Dialog — no new dependency, and it brings focus trap, Escape handling and scroll lock rather than leaving all three to F38. (F03)

