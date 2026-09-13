/**
 * Regenerates the README's screenshots.
 *
 * A README screenshot rots silently: the UI moves, the picture does not, and
 * nobody notices until a reader is looking at a version of the app that never
 * shipped. One command is the difference between re-shooting after a UI change
 * and not bothering.
 *
 * **Brave, not Chrome**, and `puppeteer-core` is resolved *through* `lighthouse`
 * for the reason `audit-overflow.mts` records: it is lighthouse's transitive
 * dependency, so pnpm's isolation puts it out of this package's reach, and
 * hardcoding the `.pnpm/puppeteer-core@<version>` path breaks silently on a
 * lighthouse bump.
 *
 * **Not every shot can be taken here.** The order ticket is a Radix dialog, and
 * `constraints/verification.md` records that a dispatched pointer sequence opens
 * a Radix *Sheet* but never the ticket — twice — and that a negative result
 * there is unjudgeable rather than failing. That one is captured by hand, in a
 * foregrounded window with real input. A script that appeared to capture it
 * would be confidently photographing a dialog that never opened.
 */

import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const puppeteerPath = require.resolve('puppeteer-core', { paths: [require.resolve('lighthouse')] })
const { default: puppeteer } = await import(pathToFileURL(puppeteerPath).href)

const BASE = process.env.SCREENSHOT_BASE ?? 'http://localhost:3000'
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const OUT_DIR = 'docs/screenshots'

/**
 * 1440 is the widest breakpoint `audit-overflow.mts` samples, so a shot taken
 * here is a width that guard has already proven does not scroll sideways.
 */
const VIEWPORT = { width: 1440, height: 900 }

/** Every shot is dark: `defaultTheme` is `dark` and `enableSystem` is off. */
const EXPECTED_THEME = 'dark'

type Shot = {
  route: string
  file: string
  /** Evaluated in the page; the shot waits for it before capturing. */
  ready?: () => boolean
}

/**
 * Every surface the README illustrates, captured in one pass.
 *
 * **Four of these are empty on an account with no trading history** — Holdings,
 * Positions, Reports, and the Dashboard's donut. They are in the list anyway,
 * because the alternative is two scripts that drift: the account gains history
 * during a trading session, the same command is re-run, and the same files fill
 * in. The README references a shot once it has something in it, which is why
 * this list is longer than the set of images the README currently uses.
 *
 * The order ticket is deliberately absent: it is a Radix dialog, and
 * `constraints/verification.md` records that a dispatched pointer sequence does
 * not open it. That one is captured by hand.
 */
const SHOTS: readonly Shot[] = [
  { route: '/', file: 'home.png' },
  { route: '/pricing', file: 'pricing.png' },
  { route: '/dashboard', file: 'dashboard.png' },
  { route: '/holdings', file: 'holdings.png' },
  { route: '/positions', file: 'positions.png' },
  { route: '/reports', file: 'reports.png' },
  { route: '/funds', file: 'funds.png' },
  {
    route: '/stocks/RELIANCE',
    file: 'stock-detail.png',
    // Lightweight Charts paints on a canvas via requestAnimationFrame, which
    // `networkidle0` knows nothing about: without this the shot is a correctly
    // sized, completely empty chart. Proven by sampling the canvas: the candles
    // are there long after the network goes quiet.
    ready: () => {
      const canvas = [...document.querySelectorAll('canvas')].find(
        (c) => c.width > 1000 && c.height > 400
      )
      if (!canvas) return false
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 3; i < data.length; i += 4 * 97) if (data[i] !== 0) return true
      return false
    },
  },
]

/** Public routes need no session; everything else must prove it landed signed in. */
const PUBLIC_ROUTES = new Set(['/', '/pricing'])
const TERMINAL_ROUTES = SHOTS.map((s) => s.route).filter((r) => !PUBLIC_ROUTES.has(r))

/**
 * The terminal is behind Google OAuth, which cannot be driven headlessly, so
 * the session arrives as a cookie string copied from a signed-in browser
 * (`document.cookie`) — the same variable `audit:overflow` already uses, rather
 * than a second name for one value. It is a credential: it lives in the
 * environment and is never written to a file.
 *
 * Absent, this fails rather than skips. Six of the eight shots are terminal
 * routes, so a silent skip would leave a run that looks green having captured
 * only the two public pages.
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

if (!cookies) {
  console.error(
    `OVERFLOW_GUARD_COOKIE is not set, so ${TERMINAL_ROUTES.length} of the ${SHOTS.length} shots cannot be taken.\n` +
      'Copy `document.cookie` from a signed-in tab into that variable and re-run.'
  )
  process.exit(1)
}

await mkdir(OUT_DIR, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? BRAVE,
  headless: true,
})

let failures = 0

try {
  const page = await browser.newPage()
  await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 2 })
  await browser.setCookie(...cookies)

  for (const shot of SHOTS) {
    const url = new URL(shot.route, base).href
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 })

    // A redirect to the login page means the cookie is stale, not that the
    // page looks like this — `audit-overflow.mts` learned the same lesson.
    const landed = new URL(page.url()).pathname
    if (TERMINAL_ROUTES.includes(shot.route) && landed !== shot.route) {
      console.error(`✗ ${shot.route} — redirected to ${landed}; the session cookie is stale`)
      failures += 1
      continue
    }

    const status = response?.status() ?? 0
    if (status !== 304 && !(status >= 200 && status < 300)) {
      console.error(`✗ ${shot.route} — HTTP ${status || 'no response'}`)
      failures += 1
      continue
    }

    // F38: a theme audit must assert the theme it actually got. The terminal
    // applies `profiles.theme` client-side on every full load, so a shot can
    // silently come back in the other theme.
    const theme = await page.evaluate(() => document.documentElement.className)
    if (!theme.split(/\s+/).includes(EXPECTED_THEME)) {
      console.error(`✗ ${shot.route} — expected the ${EXPECTED_THEME} theme, got "${theme}"`)
      failures += 1
      continue
    }

    if (shot.ready) {
      try {
        await page.waitForFunction(shot.ready, { timeout: 20_000, polling: 250 })
      } catch {
        console.error(`✗ ${shot.route} — content never finished painting`)
        failures += 1
        continue
      }
    }

    const path = `${OUT_DIR}/${shot.file}`
    await page.screenshot({ path, type: 'png' })
    console.log(`✓ ${shot.route} → ${path}`)
  }
} finally {
  await browser.close()
}

console.log(`\n${SHOTS.length - failures}/${SHOTS.length} captured into ${OUT_DIR}/`)
if (failures > 0) process.exit(1)
