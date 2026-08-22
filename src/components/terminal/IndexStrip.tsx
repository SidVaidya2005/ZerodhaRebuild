/**
 * The index strip — labels only, deliberately.
 *
 * NIFTY 50 and BANK NIFTY have no data anywhere in this project: `instruments`
 * holds 200 NSE equities, so neither has a row, a quote, or a simulator anchor
 * to walk from. SENSEX is BSE, which the NSE-only scope excludes outright, so it
 * is not listed at all.
 *
 * The strip therefore renders its slot and says plainly that no source exists
 * yet. Putting three invented numbers in the most prominent chrome on the page
 * would be the worst place in the app to fabricate data, and `CLAUDE.md`'s
 * "never label simulated data as live" rule is the one this feature is most
 * able to break. F21 adds the data.
 */

const INDICES = [
  { symbol: 'NIFTY 50', exchange: 'NSE' },
  { symbol: 'BANK NIFTY', exchange: 'NSE' },
] as const

export function IndexStrip() {
  return (
    <div aria-label="Market indices" className="hidden items-center gap-5 lg:flex">
      {INDICES.map((index) => (
        <div key={index.symbol} className="flex items-baseline gap-2">
          <span className="text-caption font-medium tracking-wide text-muted">{index.symbol}</span>
          {/* An em dash, not a zero. A zero is a price. */}
          <span className="text-body-sm text-muted tabular-nums" title="No index data source yet">
            —
          </span>
        </div>
      ))}
    </div>
  )
}
