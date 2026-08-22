/**
 * The day change, recomputed for a price that is moving.
 *
 * **This is display arithmetic, and it is never persisted.** `CLAUDE.md` puts
 * money math in Postgres — and specifically forbids computing a figure in
 * TypeScript *and storing it*. `watchlist_rows` still computes the authoritative
 * change in SQL, and that is what the server renders and what every check
 * asserts. This exists only because once the price ticks between navigations, a
 * change frozen at render time would sit beside it contradicting it.
 *
 * Nothing here reaches the database, an order, or a total. The surfaces that
 * drive a decision read the anchor and the server's own figures.
 */

export type DayChange = {
  change: number
  changePct: number
}

/**
 * Null whenever the change cannot be honestly stated: no price, no previous
 * close, or a previous close of zero. The row renders an em dash for that, the
 * same call the SQL view makes — a zero would read as "unchanged", which is a
 * claim about the market rather than an absence of data.
 */
export function dayChange(ltp: number | null, prevClose: number | null): DayChange | null {
  if (ltp === null || prevClose === null || prevClose === 0) return null
  const change = ltp - prevClose
  return { change, changePct: (change / prevClose) * 100 }
}
