/**
 * Tier-less guard: no route carries a serious or critical axe violation.
 *
 * This exists because the accessibility evidence this project had was blind in
 * two directions at once, both recorded in `constraints.md`:
 *
 *   1. **Lighthouse cannot audit any `(terminal)` page.** It carries no session,
 *      follows the redirect, and reports a perfect score for the *login* page —
 *      a 1.00 that says nothing about the page requested. Every dense table in
 *      the app lives behind that redirect.
 *   2. **`pnpm audit:a11y` only ever loads the default theme**, so a clean score
 *      is never evidence about light mode — and F35 made a light *terminal*
 *      reachable, which had therefore never been audited at all.
 *
 * So this drives a real browser with a real session, in a named theme, and runs
 * the same engine Lighthouse runs internally.
 *
 * **No new dependency.** axe-core is already on disk as lighthouse's transitive
 * dependency, and is resolved *through* lighthouse exactly as `audit-overflow.mts`
 * resolves `puppeteer-core` — pnpm's isolation puts both out of this package's
 * direct reach, and hardcoding a `.pnpm/axe-core@<version>` path would break
 * silently on a lighthouse bump.
 *
 * **Standalone, not a `test:all` tier.** It needs a running server, exactly like
 * `audit:a11y` and `audit:overflow`. Start one with `pnpm start` first — and kill
 * any previous one by PID from `lsof -nP -iTCP:3000 -sTCP:LISTEN`, because a
 * survivor keeps port 3000 and serves the *old* build
 * (`constraints/verification.md`).
 *
 * **No widths loop**, unlike the overflow guard: axe's rules are width-independent,
 * so five viewports would be five times the runtime for no extra coverage.
 *
 * Usage:
 *
 *   A11Y_AXE_COOKIE='<document.cookie from a signed-in tab>' pnpm audit:a11y:axe
 *   A11Y_AXE_THEME=light A11Y_AXE_COOKIE='…' pnpm audit:a11y:axe
 *
 * The light *terminal* pass needs `profiles.theme = 'light'` on that account —
 * see THEME below for why the script cannot arrange that itself.
 */

import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const lighthouse = require.resolve('lighthouse')
const puppeteerPath = require.resolve('puppeteer-core', { paths: [lighthouse] })
const { default: puppeteer } = await import(pathToFileURL(puppeteerPath).href)

/** `.source` is the whole engine as an injectable string — the shape axe-core's
 *  own puppeteer example uses. */
const { source: axeSource, version: axeVersion } = require(
  require.resolve('axe-core', { paths: [lighthouse] })
) as { source: string; version: string }

const BASE = process.env.A11Y_AXE_BASE ?? 'http://localhost:3000'
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'

/**
 * WCAG 2.0 and 2.1, A and AA. This is the standard the project's contrast work
 * already targets (`theme-tokens.test.ts` asserts AA), so auditing against a
 * different one would report failures nothing else in the repo agrees with.
 *
 * Deliberately *not* including `best-practice`: those are axe's own
 * recommendations rather than a conformance requirement, and a guard that fails
 * the build on them cannot be left switched on.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * `serious` and `critical` fail; `moderate` and `minor` print as notes.
 *
 * The feature's `**Verify:**` block commits to exactly this line, and it is what
 * lets the guard land switched *on* today rather than as an aspiration — a
 * threshold nobody can meet gets disabled, and a disabled guard is how the
 * property rotted in the first place.
 */
const FAILING_IMPACTS = new Set(['serious', 'critical'])

const PUBLIC_ROUTES = ['/', '/about', '/pricing', '/support', '/legal', '/auth/login']

/**
 * `/stocks/[symbol]` stands in for the whole dynamic segment — every symbol
 * renders the same components, so a second one would cost a page load and prove
 * nothing new. Same list as the overflow guard, for the same reason: two lists
 * of the app's routes would drift.
 */
const TERMINAL_ROUTES = [
  '/dashboard',
  '/orders',
  '/holdings',
  '/positions',
  '/funds',
  '/reports',
  '/settings',
  '/stocks/RELIANCE',
]

/**
 * Which theme this run is measuring.
 *
 * `next-themes` is configured `attribute="class"` with the default `theme`
 * storage key, so the theme is set by writing localStorage *before* the page's
 * scripts run and then loading — never by toggling the class afterwards.
 * Elements carrying `transition-colors` return stale computed colours after a
 * scripted class change, which fabricated a 17-failure phantom during 1.00.01
 * that vanished on a real page load (`constraints.md`).
 *
 * **The terminal overrides this from the account.** F35 has the terminal layout
 * read `profiles.theme` and call `setTheme` once per full load, because
 * `next-themes` accepts no server value — so on a terminal route the account's
 * stored theme wins over whatever this script wrote. That is why `assertTheme`
 * below is a hard failure rather than a warning: a light run that silently
 * measured dark would be a false pass on exactly the surface that has never been
 * audited. Flip the toggle in Settings for the light pass.
 */
const THEME = process.env.A11Y_AXE_THEME ?? 'dark'

if (THEME !== 'dark' && THEME !== 'light') {
  console.error(`A11Y_AXE_THEME must be 'dark' or 'light'; got '${THEME}'.`)
  process.exit(1)
}

type Violation = {
  id: string
  impact: string | null
  help: string
  helpUrl: string
  nodes: { html: string; target: string[] }[]
}

/**
 * The terminal is behind Google OAuth, which cannot be driven headlessly, so the
 * session arrives as a cookie string copied from a signed-in browser
 * (`document.cookie`). It is a credential: it lives in the environment and is
 * never written to a file.
 *
 * Absent, this **fails rather than skips** — `test:parity`'s behaviour without
 * `TEST_DATABASE_URL`, and the overflow guard's without its cookie. A guard that
 * silently drops the eight routes carrying every table and dialog would report
 * green on the half of the app that was already being audited.
 */
function sessionCookies(url: URL) {
  const raw = process.env.A11Y_AXE_COOKIE
  if (!raw) return null

  return raw
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=')
      return { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain: url.hostname, path: '/' }
    })
    .filter((cookie) => cookie.name !== '')
}

const base = new URL(BASE)
const cookies = sessionCookies(base)
const routes = cookies ? [...PUBLIC_ROUTES, ...TERMINAL_ROUTES] : PUBLIC_ROUTES

if (!cookies && process.env.A11Y_AXE_PUBLIC_ONLY !== '1') {
  console.error(
    'A11Y_AXE_COOKIE is not set, so the eight terminal routes — the ones Lighthouse has never\n' +
      'been able to reach — cannot be loaded. Copy `document.cookie` from a signed-in tab into\n' +
      'that variable, or set A11Y_AXE_PUBLIC_ONLY=1 to accept public-only coverage deliberately.'
  )
  process.exit(1)
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? BRAVE,
  headless: true,
})

let failures = 0
let checked = 0
let noted = 0

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  if (cookies) await browser.setCookie(...cookies)

  // Establish the origin so localStorage is writable, then seed the theme. From
  // here every navigation loads with the class already applied by next-themes'
  // injected script, which is what "measure a theme by loading it" means.
  await page.goto(base.href, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.evaluateOnNewDocument(
    (theme: string) => window.localStorage.setItem('theme', theme),
    THEME
  )

  for (const route of routes) {
    const url = new URL(route, base).href
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 45_000 })

    // A redirect to the login page means the cookie is stale, not that the page
    // is clean — reporting "no violations" for it would be a false pass.
    const landed = new URL(page.url()).pathname
    if (TERMINAL_ROUTES.includes(route) && landed !== route) {
      console.error(`✗ ${route} — redirected to ${landed}; the session cookie is stale`)
      failures += 1
      continue
    }

    // `response.ok()` is 2xx only, and the static marketing pages answer 304 on a
    // warm cache — a cached success, not a failure. Judging on `ok()` failed ten
    // of eighteen checks the first time the overflow guard ran.
    const status = response?.status() ?? 0
    if (status !== 304 && !(status >= 200 && status < 300)) {
      console.error(`✗ ${route} — HTTP ${status || 'no response'}`)
      failures += 1
      continue
    }

    // The theme actually on the element, not the one we asked for. On a terminal
    // route F35's layout re-applies the account's stored theme, so this is the
    // difference between auditing light mode and believing we did.
    const applied = await page.evaluate(() => {
      const cls = document.documentElement.classList
      return cls.contains('light') ? 'light' : cls.contains('dark') ? 'dark' : 'none'
    })
    if (applied !== THEME) {
      console.error(
        `✗ ${route} — asked for ${THEME}, page loaded ${applied}.` +
          (TERMINAL_ROUTES.includes(route)
            ? ` Set profiles.theme='${THEME}' for this account in Settings (F35 applies it client-side and it wins over localStorage).`
            : '')
      )
      failures += 1
      continue
    }

    // Inject the engine and run it in one handle, per axe-core's own puppeteer
    // example. The template form needs no `axe` global declared for tsc.
    const handle = await page.evaluateHandle(`
      ${axeSource}
      axe.run({ runOnly: { type: 'tag', values: ${JSON.stringify(WCAG_TAGS)} } })
    `)
    const results = (await handle.jsonValue()) as { violations: Violation[] }
    await handle.dispose()
    checked += 1

    const failing = results.violations.filter((v) => FAILING_IMPACTS.has(v.impact ?? ''))
    const notes = results.violations.filter((v) => !FAILING_IMPACTS.has(v.impact ?? ''))

    if (failing.length === 0) {
      const suffix = notes.length > 0 ? ` (${notes.length} moderate/minor)` : ''
      console.log(`✓ ${THEME} ${route}${suffix}`)
    } else {
      failures += 1
      console.error(`✗ ${THEME} ${route} — ${failing.length} serious/critical`)
    }

    // The offending element is the finding. A bare count sends the next reader
    // back to the browser, which is the same reasoning the overflow guard's
    // offender list exists for.
    for (const v of failing) {
      console.error(`    [${v.impact}] ${v.id} — ${v.help}`)
      console.error(`      ${v.helpUrl}`)
      for (const node of v.nodes.slice(0, 4)) {
        console.error(`      at ${node.target.join(' ')}`)
        console.error(`         ${node.html.replace(/\s+/g, ' ').slice(0, 140)}`)
      }
      if (v.nodes.length > 4) console.error(`      …and ${v.nodes.length - 4} more nodes`)
    }

    for (const v of notes) {
      noted += 1
      console.log(`      note [${v.impact}] ${v.id} × ${v.nodes.length} — ${v.help}`)
    }
  }

  await page.close()
} finally {
  await browser.close()
}

console.log(
  `\naxe-core ${axeVersion} · ${WCAG_TAGS.join(', ')} · theme=${THEME}\n` +
    `${checked} of ${routes.length} routes audited` +
    (cookies ? '' : ' (public routes only)') +
    (noted > 0 ? ` · ${noted} moderate/minor noted, not failing` : '')
)

if (failures > 0) {
  console.error(`${failures} failed.`)
  process.exit(1)
}

console.log('No serious or critical violations.')
