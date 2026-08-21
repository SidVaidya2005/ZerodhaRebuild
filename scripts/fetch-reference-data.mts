/**
 * Refresh the committed reference data: the Nifty 200 universe and NSE's
 * trading-holiday calendar.
 *
 * This is the **refresh** half of feature 14, and it is deliberately not the
 * seed. NSE's endpoints are undocumented — the warm-up URL this script needs for
 * a cookie already answers 403 while the API call behind it succeeds — so a seed
 * that hit them live would break unpredictably, and would change ~200 rows with
 * no diff to read first. This writes files; `seed-reference.mts` writes the
 * database, offline, from what is committed.
 *
 * Run it in January, when the published calendar changes, or after an index
 * rebalance. Read the diff before committing it.
 *
 * Node 26 strips TypeScript natively, so this runs as
 * `node scripts/fetch-reference-data.mts` with no transpiler in the way.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { exit } from 'node:process'

const NIFTY_200_CSV = 'https://nsearchives.nseindia.com/content/indices/ind_nifty200list.csv'
/**
 * The published end-of-day file, on the **archive** host — not the
 * `www.nseindia.com/api/*` endpoints, which answer 403 behind bot protection.
 * It carries a real close for every listed security, which is what the
 * simulator walks from (F15).
 */
const BHAVCOPY = (ddmmyyyy: string) =>
  `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy}.csv`
const HOLIDAY_API = 'https://www.nseindia.com/api/holiday-master?type=trading'
const NSE_HOME = 'https://www.nseindia.com/'
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'

const SEED_DIR = join(process.cwd(), 'supabase', 'seed')

/** NSE serves nothing to a client that does not look like a browser. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/**
 * Yahoo throttles bursts hard and recovers within seconds.
 *
 * Probing four at a time with a 250ms pause — roughly 16 requests a second — got
 * every one of 200 symbols back as 429, which the first version of this script
 * dutifully reported as "200 symbols do not resolve". Sequential with a pause
 * is slower and truthful. A refresh runs a few times a year.
 */
const PROBE_PAUSE_MS = 1_500
// Yahoo's penalty box outlasts a polite pause: once tripped it keeps answering
// 429 for minutes, so the ladder is long enough to wait it out unattended.
const THROTTLE_BACKOFF_MS = [10_000, 30_000, 60_000, 120_000, 300_000]

/**
 * Probe results survive a throttled run.
 *
 * Yahoo's block outlasts any sensible in-process backoff, and re-probing 200
 * symbols from scratch on every attempt is what keeps tripping it. Verified
 * symbols are remembered here so a second run picks up where the first stopped.
 * Gitignored: it is a scratch pad, not data.
 */
const PROBE_CACHE = join(process.cwd(), '.cache', 'yahoo-probe.json')

type Instrument = {
  symbol: string
  name: string
  sector: string
  yahoo_symbol: string
  /** Last published NSE close. Null when bhavcopy has no EQ row for the symbol. */
  prev_close: number | null
}

type Holiday = {
  trading_date: string
  description: string
}

function fail(message: string): never {
  console.error(`[reference] ${message}`)
  exit(1)
}

async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const text = await tryGetText(url, headers)
  if (text === null) fail(`${url} did not return a usable response`)
  return text
}

/** Returns null instead of exiting, for callers that expect a miss. */
async function tryGetText(
  url: string,
  headers: Record<string, string> = {}
): Promise<string | null> {
  const response = await fetch(url, {
    headers: { 'user-agent': BROWSER_UA, accept: '*/*', ...headers },
  })
  if (!response.ok) {
    console.error(`[reference] ${url} answered ${response.status}`)
    return null
  }
  return response.text()
}

/**
 * A real CSV parser rather than `split(',')`: NSE quotes any company name
 * containing a comma, and splitting naively shifts every later column — which is
 * how `sector` silently becomes half a company name.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows
  if (!header) fail('the constituent CSV was empty')
  return body
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) =>
      Object.fromEntries(header.map((key, i) => [key.trim(), (cells[i] ?? '').trim()]))
    )
}

/**
 * The most recent bhavcopy, found by walking backwards a day at a time.
 *
 * There is no endpoint for "latest": weekends and the trading holidays F14
 * seeded simply have no file, and a missing file answers 404. Walking back until
 * one responds is what makes this correct on a Sunday, on Republic Day, and at
 * 09:00 before the day's file exists.
 */
async function fetchPrevCloses(): Promise<Map<string, number>> {
  for (let daysBack = 0; daysBack <= 10; daysBack += 1) {
    const day = new Date()
    day.setUTCDate(day.getUTCDate() - daysBack)
    const stamp =
      String(day.getUTCDate()).padStart(2, '0') +
      String(day.getUTCMonth() + 1).padStart(2, '0') +
      day.getUTCFullYear()

    const csv = await tryGetText(BHAVCOPY(stamp), { accept: 'text/csv,*/*' })
    if (csv === null) continue

    const closes = new Map<string, number>()
    for (const row of parseCsv(csv)) {
      // Every header and value in this file carries leading spaces, so each is
      // trimmed on read. parseCsv trims the headers; the values are trimmed here.
      if ((row['SERIES'] ?? '').trim() !== 'EQ') continue
      const symbol = (row['SYMBOL'] ?? '').trim()
      const close = Number((row['CLOSE_PRICE'] ?? '').trim())
      if (symbol && Number.isFinite(close) && close > 0) closes.set(symbol, close)
    }

    if (closes.size > 0) {
      console.log(`[reference] bhavcopy ${stamp}: ${closes.size} EQ closes`)
      return closes
    }
  }
  fail('no bhavcopy found in the last 10 days')
}

async function fetchInstruments(): Promise<Instrument[]> {
  const rows = parseCsv(await getText(NIFTY_200_CSV, { accept: 'text/csv,*/*' }))
  const closes = await fetchPrevCloses()

  const instruments = rows.map((row) => {
    const symbol = row['Symbol'] ?? ''
    const name = row['Company Name'] ?? ''
    const sector = row['Industry'] ?? ''
    if (!symbol || !name || !sector) {
      fail(`a constituent row is missing a field: ${JSON.stringify(row)}`)
    }
    return {
      symbol,
      name,
      sector,
      yahoo_symbol: `${symbol}.NS`,
      // Null rather than a guess: a symbol with no EQ row in the latest
      // bhavcopy has no close, and the simulator refuses to invent one.
      prev_close: closes.get(symbol) ?? null,
    }
  })

  if (instruments.length < 190 || instruments.length > 210) {
    fail(`expected ~200 constituents, got ${instruments.length} — the CSV shape may have changed`)
  }
  return instruments.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

const MONTHS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
}

/**
 * `26-Jan-2026` to `2026-01-26`, by hand.
 *
 * Never `new Date('26-Jan-2026')`: that parses as UTC midnight, and rendering it
 * back in any timezone west of Greenwich yields the 25th. A trading holiday off
 * by one day is a market that is open when it should be closed.
 */
function toIsoDate(published: string): string {
  const match = published.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/)
  const month = match?.[2] ? MONTHS[match[2]] : undefined
  if (!match || !month) fail(`unrecognised holiday date: ${published}`)
  return `${match[3]}-${month}-${match[1]}`
}

async function fetchHolidays(year: number): Promise<Holiday[]> {
  // The warm-up sets the cookie the API expects. It answers 403 itself and that
  // is fine — the Set-Cookie header arrives regardless.
  const warmup = await fetch(NSE_HOME, { headers: { 'user-agent': BROWSER_UA } })
  const cookie = warmup.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')

  const raw = await getText(HOLIDAY_API, {
    accept: 'application/json',
    referer: 'https://www.nseindia.com/resources/exchange-communication-holidays',
    ...(cookie ? { cookie } : {}),
  })

  const parsed = JSON.parse(raw) as Record<string, { tradingDate?: string; description?: string }[]>
  // CM is the capital-market segment — the one this project trades.
  const rows = parsed['CM']
  if (!rows?.length) fail('the holiday response carried no CM segment')

  const holidays = rows
    .map((row) => ({
      trading_date: toIsoDate(row.tradingDate ?? ''),
      description: (row.description ?? '').trim(),
    }))
    .filter((holiday) => holiday.trading_date.startsWith(String(year)))

  for (const holiday of holidays) {
    if (!holiday.description) fail(`holiday ${holiday.trading_date} has no description`)
  }
  if (holidays.length === 0) fail(`no ${year} holidays in the response`)

  return holidays.sort((a, b) => a.trading_date.localeCompare(b.trading_date))
}

/**
 * Every symbol, not a sample.
 *
 * `${symbol}.NS` is a derivation, not a fact, and it is wrong for a few names
 * every year. Yahoo answers 200 for a tradable symbol and 404 for one it does
 * not know, so the whole universe is checkable — and four symbols in this list
 * carry `&` or `-`, which are exactly the ones a URL will mangle if they are not
 * encoded.
 *
 * **A 429 is not a verdict on the symbol.** Conflating "upstream refused us"
 * with "this symbol does not exist" is how a throttled run condemns a perfectly
 * good universe, which is precisely what the first version of this script did.
 * Throttling is retried with backoff and, if it persists, aborts the whole run
 * rather than being recorded against a symbol.
 */
async function probeSymbol(yahooSymbol: string): Promise<string | null> {
  const url = `${YAHOO_CHART}/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`

  for (let attempt = 0; ; attempt += 1) {
    let response: Response
    try {
      response = await fetch(url, { headers: { 'user-agent': BROWSER_UA, accept: '*/*' } })
    } catch (error) {
      return `${yahooSymbol} (${(error as Error).message})`
    }

    if (response.status === 429) {
      const wait = THROTTLE_BACKOFF_MS[attempt]
      if (wait === undefined) {
        fail(
          `Yahoo is throttling (429) even after ${THROTTLE_BACKOFF_MS.length} backoffs, at ${yahooSymbol}. ` +
            'Nothing is written, and this is not a verdict on any symbol. ' +
            'Every symbol verified so far is cached, so running again resumes rather than restarts.'
        )
      }
      await new Promise((resolve) => setTimeout(resolve, wait))
      continue
    }

    // 404 is the real signal: Yahoo knows its universe and does not know this.
    return response.ok ? null : `${yahooSymbol} (HTTP ${response.status})`
  }
}

function loadProbeCache(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(PROBE_CACHE, 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

function saveProbeCache(cache: Record<string, string>): void {
  mkdirSync(join(process.cwd(), '.cache'), { recursive: true })
  writeFileSync(PROBE_CACHE, `${JSON.stringify(cache, null, 2)}\n`)
}

async function probeYahoo(instruments: readonly Instrument[]): Promise<string[]> {
  const cache = loadProbeCache()
  const broken: string[] = []
  let checked = 0

  for (const [index, instrument] of instruments.entries()) {
    const cached = cache[instrument.yahoo_symbol]
    if (cached === 'ok') {
      process.stdout.write(`\r[reference] ${index + 1}/${instruments.length} (cached)      `)
      continue
    }

    const problem = await probeSymbol(instrument.yahoo_symbol)
    if (problem) broken.push(problem)
    cache[instrument.yahoo_symbol] = problem ?? 'ok'
    saveProbeCache(cache)
    checked += 1

    process.stdout.write(`\r[reference] ${index + 1}/${instruments.length} (${checked} probed)   `)
    await new Promise((resolve) => setTimeout(resolve, PROBE_PAUSE_MS))
  }
  process.stdout.write('\n')
  return broken
}

/** Two-space JSON with a trailing newline, so an unchanged refresh is a no-op diff. */
function writeJson(file: string, payload: unknown): void {
  writeFileSync(join(SEED_DIR, file), `${JSON.stringify(payload, null, 2)}\n`)
}

async function main(): Promise<void> {
  const year = new Date().getFullYear()

  // Probing is opt-in (`--probe`), because Yahoo is deferred to the end of the
  // project (F14). The derived `yahoo_symbol` is still written — it is the
  // string the Yahoo provider will use whenever it is built — but nothing has
  // confirmed it resolves, and the JSON records that honestly rather than
  // letting a later reader assume it was checked.
  const probe = process.argv.includes('--probe')
  const instruments = await fetchInstruments()
  const priced = instruments.filter((i) => i.prev_close !== null).length
  console.log(`[reference] ${instruments.length} constituents, ${priced} with a close`)

  const broken = probe ? await probeYahoo(instruments) : []
  if (!probe) {
    console.log('[reference] skipping the Yahoo probe (pass --probe to run it)')
  }
  if (broken.length > 0) {
    // Nothing is written. A universe containing a symbol that never quotes is
    // worse than no refresh at all: the failure surfaces in Phase 5, on one
    // stock's page, long after this ran.
    console.error(`[reference] ${broken.length} symbol(s) do not resolve on Yahoo:`)
    for (const symbol of broken) console.error(`    ${symbol}`)
    fail('refusing to write the seed files')
  }

  const holidays = await fetchHolidays(year)
  console.log(`[reference] ${holidays.length} ${year} holidays`)

  writeJson('nifty200.json', {
    source: NIFTY_200_CSV,
    fetched_on: new Date().toISOString().slice(0, 10),
    // False until `--probe` has confirmed every symbol against Yahoo. Recorded
    // in the file so nobody downstream mistakes "seeded" for "verified".
    yahoo_validated: probe,
    instruments,
  })
  writeJson('nse-holidays.json', {
    source: HOLIDAY_API,
    year,
    note: 'Re-fetch every January: NSE publishes the next calendar year separately.',
    fetched_on: new Date().toISOString().slice(0, 10),
    holidays,
  })

  console.log('[reference] wrote supabase/seed/nifty200.json and nse-holidays.json')
}

await main()
