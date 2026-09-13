'use client'

import { PriceWithProvenance } from '@/components/terminal/PriceWithProvenance'
import { dayChange } from '@/lib/market/change'
import { serverProvenance } from '@/lib/market/screen-provenance'
import { cn, formatSignedCurrency, formatSignedPercent } from '@/lib/utils'
import type { QuoteProviderName } from '@shared/provenance.ts'

import { useNow } from './TerminalClock'
import { useHoldingPrices, useHoldingProvenance } from './use-holding-prices'

/**
 * The instrument header: what this symbol is, and what it last traded at.
 *
 * **The price is the anchor, described by `anchorProvenance`.** That is what
 * `useHoldingProvenance` returns — `provenanceOf` would report whatever the
 * tween is doing rather than what is rendered, announcing "interpolated" over
 * the last reported price (F30).
 *
 * **`serverProvenance` is the fallback, not `null`.** `PriceWithProvenance`
 * renders an em dash whenever provenance is null, so `provenance={live ? … :
 * null}` would render every price as an em dash in the fetched HTML — and
 * hydration hides it, so only `curl` shows the bug (F20).
 */

export type StockHeaderProps = {
  symbol: string
  name: string
  exchange: string
  /** The server's own quote row, rendered until the store has a fresher one. */
  quote: {
    ltp: number | null
    prevClose: number | null
    provider: QuoteProviderName | null
    providerTs: string | null
    fetchedAt: string | null
  }
}

export function StockHeader({ symbol, name, exchange, quote }: StockHeaderProps) {
  const now = useNow()
  const rows = [{ symbol }]
  const { anchors, prevCloses } = useHoldingPrices(rows)
  const provenances = useHoldingProvenance(rows, now)

  // `store ?? prop`, with the store seeded in an effect, so server and first
  // client render match and a symbol with no quote keeps its em dash (F19).
  const ltp = anchors[symbol] ?? quote.ltp
  const prevClose = prevCloses[symbol] ?? quote.prevClose
  const provenance = provenances[symbol] ?? serverProvenance({ ...quote, ltp: quote.ltp }, now)

  // The same helper the watchlist and both portfolio tables use, rather than a
  // fourth copy of the arithmetic — it is also the one that decides an em dash
  // is the honest render when the change cannot be stated (F19).
  const change = dayChange(ltp, prevClose)

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-title text-ink">{symbol}</h1>
        <p className="truncate text-body-sm text-muted">
          {name} · {exchange}
        </p>
      </div>

      <div className="text-right">
        <PriceWithProvenance
          value={ltp}
          provenance={provenance}
          anchor={ltp}
          className="text-title-lg tabular-nums"
        />
        <p className={cn('text-body-sm tabular-nums', toneOf(change?.change ?? null))}>
          {change === null
            ? '—'
            : `${formatSignedCurrency(change.change)} (${formatSignedPercent(change.changePct)})`}
        </p>
      </div>
    </header>
  )
}

/** Colour never carries the sign alone — the formatter renders an explicit +/−. */
function toneOf(value: number | null): string {
  if (value === null) return 'text-muted'
  if (value > 0) return 'text-up-text'
  if (value < 0) return 'text-down-text'
  return 'text-ink'
}
