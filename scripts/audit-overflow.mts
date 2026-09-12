/**
 * Tier-less guard: no route may scroll sideways.
 *
 * F37 found both of the horizontal-overflow causes this phase had recorded
 * already fixed — Phase 5 closed them in passing, and nobody noticed either
 * way. That is precisely how the property rots again, so it gets a check rather
 * than a paragraph.
 *
 * **Standalone, not a `test:all` tier.** It needs a running server, exactly like
 * `audit:a11y`, which is outside `test:all` for the same reason. Start one with
 * `pnpm start` first — and kill any previous one by PID, because a survivor
 * keeps port 3000 and serves the old build (`constraints/verification.md`).
 *
 * **Brave, not Chrome**, and `puppeteer-core` is resolved *through* `lighthouse`
 * rather than imported directly: it is lighthouse's transitive dependency, so
 * pnpm's isolation puts it out of this package's reach, and hardcoding the
 * `.pnpm/puppeteer-core@<version>` path would break silently on a lighthouse
 * bump.
 */

import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const puppeteerPath = require.resolve('puppeteer-core', { paths: [require.resolve('lighthouse')] })
const { default: puppeteer } = await import(pathToFileURL(puppeteerPath).href)

const BASE = process.env.OVERFLOW_GUARD_BASE ?? 'http://localhost:3000'
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'

/**
 * Phone, tablet, desktop — and **both Tailwind breakpoints in between**.
 *
 * The three the feature's `**Verify:**` block originally named were 375, 768
 * and 1440, and that gap is what hid a 202px sideways scroll on every terminal
 * page from 1024 to ~1226: the band opens exactly where `lg:` brings the
 * six-link nav into a bar that cannot hold it, and closes before 1440. A
 * responsive check that samples only the comfortable widths measures the places
 * a layout is least likely to break, so the boundaries are now in the list.
 */
const WIDTHS = [375, 768, 1024, 1280, 1440]

const PUBLIC_ROUTES = ['/', '/about', '/pricing', '/support', '/legal', '/auth/login']

/**
 * `/stocks/[symbol]` stands in for the whole dynamic segment — every symbol
 * renders the same components, so a second one would cost a page load and prove
 * nothing new.
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

type Offender = { tag: string; cls: string; right: number; width: number; text: string }
type Measurement = { scrollWidth: number; clientWidth: number; offenders: Offender[] }

/**
 * Read in the page: compare the document's scroll width to its client width,
 * and when they differ, name what is sticking out. A bare "it overflows by
 * 104px" sends the next reader back to the browser; the element that did it is
 * the whole finding.
 */
function measure(): Measurement {
  const root = document.documentElement
  const viewport = window.innerWidth
  const offenders: Offender[] = []

  if (root.scrollWidth > root.clientWidth) {
    for (const element of document.querySelectorAll('body *')) {
      const box = element.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      if (box.right <= viewport + 0.5) continue
      const raw = element.className
      offenders.push({
        tag: element.tagName.toLowerCase(),
        cls: (typeof raw === 'string'
          ? raw
          : String((raw as { baseVal?: string })?.baseVal ?? '')
        ).slice(0, 100),
        right: Math.round(box.right),
        width: Math.round(box.width),
        text: (element.textContent ?? '').trim().slice(0, 40),
      })
    }
    offenders.sort((a, b) => b.right - a.right)
  }

  return {
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    offenders: offenders.slice(0, 5),
  }
}

/**
 * The terminal is behind Google OAuth, which cannot be driven headlessly, so
 * the session arrives as a cookie string copied from a signed-in browser
 * (`document.cookie`). It is a credential: it lives in the environment and is
 * never written to a file.
 *
 * Absent, this **fails rather than skips** — `test:parity`'s behaviour without
 * `TEST_DATABASE_URL`. A guard that silently drops the eight routes carrying
 * every dense table would report green on the half of the app that cannot
 * overflow.
 */
function sessionCookies(url: URL) {
  const raw = process.env.OVERFLOW_GUARD_COOKIE
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

if (!cookies && process.env.OVERFLOW_GUARD_PUBLIC_ONLY !== '1') {
  console.error(
    'OVERFLOW_GUARD_COOKIE is not set, so the eight terminal routes — the ones with the dense\n' +
      'tables — cannot be loaded. Copy `document.cookie` from a signed-in tab into that variable,\n' +
      'or set OVERFLOW_GUARD_PUBLIC_ONLY=1 to accept public-only coverage deliberately.'
  )
  process.exit(1)
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? BRAVE,
  headless: true,
})

let failures = 0
let checked = 0

try {
  for (const width of WIDTHS) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 800 })
    if (cookies) await browser.setCookie(...cookies)

    for (const route of routes) {
      const url = new URL(route, base).href
      const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 45_000 })

      // A redirect to the login page means the cookie is stale, not that the
      // page is narrow — reporting "no overflow" for it would be a false pass.
      const landed = new URL(page.url()).pathname
      if (TERMINAL_ROUTES.includes(route) && landed !== route) {
        console.error(
          `✗ ${width}px ${route} — redirected to ${landed}; the session cookie is stale`
        )
        failures += 1
        continue
      }
      // `response.ok()` is 2xx only, and the static marketing pages answer 304
      // from the second width onward — a cached success, not a failure. Judging
      // on `ok()` failed ten of eighteen checks the first time this ran.
      const status = response?.status() ?? 0
      if (status !== 304 && !(status >= 200 && status < 300)) {
        console.error(`✗ ${width}px ${route} — HTTP ${status || 'no response'}`)
        failures += 1
        continue
      }

      const { scrollWidth, clientWidth, offenders } = await page.evaluate(measure)
      checked += 1

      if (scrollWidth > clientWidth) {
        failures += 1
        console.error(`✗ ${width}px ${route} — scrolls ${scrollWidth - clientWidth}px sideways`)
        for (const o of offenders) {
          console.error(`    <${o.tag}> right=${o.right} width=${o.width} "${o.text}"`)
          console.error(`      class="${o.cls}"`)
        }
      } else {
        console.log(`✓ ${width}px ${route}`)
      }
    }

    await page.close()
  }
} finally {
  await browser.close()
}

console.log(
  `\n${checked} checks across ${routes.length} routes × ${WIDTHS.length} widths` +
    (cookies ? '' : ' (public routes only)')
)

if (failures > 0) {
  console.error(`${failures} failed.`)
  process.exit(1)
}

console.log('No route scrolls sideways.')
