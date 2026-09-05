'use client'

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { Provenance, QuoteProviderName } from '@shared/provenance.ts'

import { anchorProvenance } from '@/lib/market/screen-provenance'
import type { HoldingRow } from '@/lib/portfolio/types'
import { useQuoteStore } from '@/lib/stores/quote-store'

/**
 * The live prices the dashboard needs, selected so a tween cannot re-render it.
 *
 * **Subscribing to `state.quotes` wholesale was the bug this replaces.** The
 * interpolation loop rebuilds that map on every animation frame, so any
 * component holding it re-rendered ~60 times a second for the ~800ms after each
 * tick — recomputing totals and, worse, re-rendering the Recharts SVG — to
 * produce *identical* output, because every figure here derives from `anchor`
 * and `anchor` does not move mid-tween. `library-docs.md` § Zustand says a
 * selector returning several values must be wrapped in `useShallow`; this is
 * that rule applied.
 *
 * Both maps hold primitives, which is what makes the shallow comparison work: a
 * map of `LiveQuote` objects would compare unequal on every frame and change
 * nothing.
 */

export type PriceMap = Record<string, number | null>

export function useHoldingPrices(holdings: HoldingRow[]): {
  anchors: PriceMap
  prevCloses: PriceMap
} {
  // Joined so the selector identity is stable across renders that did not
  // change which symbols are held.
  const symbols = holdings.map((holding) => holding.symbol).join(',')

  const anchors = useQuoteStore(
    useShallow((state) => {
      const map: PriceMap = {}
      for (const symbol of symbols === '' ? [] : symbols.split(',')) {
        map[symbol] = state.quotes[symbol]?.anchor ?? null
      }
      return map
    })
  )

  // Selected rather than taken from the server row: `prev_close` rolls at the
  // first in-session tick, and a page left open overnight would otherwise
  // compute the day's P&L against yesterday's basis.
  const prevCloses = useQuoteStore(
    useShallow((state) => {
      const map: PriceMap = {}
      for (const symbol of symbols === '' ? [] : symbols.split(',')) {
        map[symbol] = state.quotes[symbol]?.prevClose ?? null
      }
      return map
    })
  )

  return { anchors, prevCloses }
}

/**
 * The provenance of each holding's *anchor*, for a table that renders one.
 *
 * Kept out of `useHoldingPrices` because the dashboard has no use for it: its
 * tiles are aggregates and carry one summary disclosure rather than a claim per
 * symbol. F30's table is the first surface that renders a per-symbol price from
 * the anchor, so it is the first that needs this.
 *
 * **Three flat maps of primitives, not a map of `Provenance`.** Building the
 * objects inside a selector would return new references on every call and defeat
 * `useShallow` entirely — the same trap the hook above documents, one level up.
 * The three fields selected here are untouched by the interpolation loop, which
 * writes only `ltp`, `from` and `startedAt`, so their references are stable
 * between ticks and the shallow comparison holds.
 *
 * A symbol the store has not seen yet is absent from the result; the caller
 * falls back to `serverProvenance`, per the F20 constraint that names F30.
 */
export function useHoldingProvenance(
  holdings: HoldingRow[],
  now: Date
): Record<string, Provenance> {
  const symbols = holdings.map((holding) => holding.symbol).join(',')

  const providers = useQuoteStore(
    useShallow((state) => {
      const map: Record<string, QuoteProviderName | null> = {}
      for (const symbol of symbols === '' ? [] : symbols.split(',')) {
        map[symbol] = state.quotes[symbol]?.provider ?? null
      }
      return map
    })
  )

  const providerTimes = useQuoteStore(
    useShallow((state) => {
      const map: Record<string, Date | null> = {}
      for (const symbol of symbols === '' ? [] : symbols.split(',')) {
        map[symbol] = state.quotes[symbol]?.providerTs ?? null
      }
      return map
    })
  )

  const fetchedAts = useQuoteStore(
    useShallow((state) => {
      const map: Record<string, Date | null> = {}
      for (const symbol of symbols === '' ? [] : symbols.split(',')) {
        map[symbol] = state.quotes[symbol]?.fetchedAt ?? null
      }
      return map
    })
  )

  return useMemo(() => {
    const map: Record<string, Provenance> = {}
    for (const [symbol, provider] of Object.entries(providers)) {
      const fetchedAt = fetchedAts[symbol]
      // Both are required to make any claim at all. Without them there is no
      // live provenance and the caller uses the server row's instead.
      if (provider === null || fetchedAt === null || fetchedAt === undefined) continue
      map[symbol] = anchorProvenance(
        { provider, providerTs: providerTimes[symbol] ?? null, fetchedAt },
        now
      )
    }
    return map
  }, [providers, providerTimes, fetchedAts, now])
}
