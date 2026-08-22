'use client'

import { useShallow } from 'zustand/react/shallow'

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
