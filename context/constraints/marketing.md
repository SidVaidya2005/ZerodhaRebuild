# Constraints — The public marketing site

> Read this part of `context/constraints.md` before building or changing a page under
> `(marketing)`. These rules apply to the public site; terminal work can skip this file.

- The support form uses React 19's form action and `useActionState` so it submits and validates with JavaScript disabled. Do not switch it to react-hook-form. `code-standards.md` records its exception to the usual Server Action shape. (F07B)
- FAQs use native `<details>`/`<summary>`. The browser supplies keyboard operation, focus handling and screen-reader semantics with no JavaScript to implement or audit later at F38. (F07)
- `support_messages` has CHECK length limits and a honeypot. Volume abuse is deliberately unmitigated: the publishable key is public in the browser bundle, and real rate limiting is outside this portfolio contact form's scope. The bounds limit damage from an individual request. (F07B)
- Give each honesty section a distinct job. Home explains price provenance, About lists what is Real / Simulated, and `/legal` explains consequences and deliberate divergences. Each notice must make sense on its own. (F05)
- Home explains all four provenance states and marks two unreachable. `LIVE` cannot occur because `PROVIDER_IS_REALTIME` is `false` for all three providers. `DELAYED` cannot occur because no real provider is wired and all quotes resolve to `SIMULATED`. The chips are hand-written, so adding a real provider requires changing `DELAYED` back to `reachable` manually. (F04, extended 6.00.04)
- Public copy must not call prices real, live, or provider-fetched while the simulator is the only provider. The instruments are real NSE symbols; the prices are simulated from a real closing price. The correction covered eight places: the hero, feature tile, badge vocabulary, About's Real column and intro, `/legal`, the support FAQ, and Home's `description` metadata. (6.00.04)
- About's stack table reads the typed `src/lib/stack.ts`. Its drift test works both ways: every `installed` version must match `package.json`, and every `planned` package must be absent from it. Show future packages as "planned" without inventing a version. (F05)
- Use the shared `ExternalLink` for every external link. It supplies `target="_blank" rel="noreferrer"` and sr-only "opens in a new tab" text. Search for raw `target="_blank"` to find links that bypass it. (F05)
- Keep the hero typographic. F40 can use a screenshot of the completed terminal; do not maintain a separate mock terminal UI. (F04)
- The simulator disclaimer is dismissible, remembers the choice, and must not flash on load. A blocking inline script sets `data-disclaimer` on `<html>` before first paint, and CSS hides the strip from that attribute. This uses the same approach as `next-themes` while keeping the layout a Server Component. (F03)
- Mobile navigation uses shadcn's `sheet`, built on Radix Dialog. It needs no new dependency and already supplies focus trapping, Escape handling and scroll locking. Do not defer those behaviours to F38. (F03)
