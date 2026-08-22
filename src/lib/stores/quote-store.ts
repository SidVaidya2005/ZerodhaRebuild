import type { QuoteProviderName } from '@shared/provenance.ts'
import { create } from 'zustand'

import { TWEEN_DURATION_MS, isTweening, tweenAt } from '@/lib/market/interpolate'

/**
 * The live quote store.
 *
 * Holds prices only. Orders, holdings, funds and positions are server state and
 * never enter Zustand — they refresh through Server Action revalidation.
 *
 * **`anchor` is the truth and `ltp` may be synthetic.** Every decision surface —
 * the order ticket, the confirmation, the stock detail header, every monetary
 * total — reads `anchor`. Only ambient surfaces render `ltp`, and only the
 * watchlist does so today.
 *
 * **`source` is deliberately absent.** Freshness changes with the clock, so a
 * stored `source` goes wrong with no state change at all. `deriveSource()` runs
 * on render, against `provider` and `providerTs`, which is what this keeps.
 */

export type LiveQuote = {
  /** The last price a provider actually reported. Never interpolated. */
  anchor: number
  /** What is on screen. Equal to `anchor` except mid-tween, when it is synthetic. */
  ltp: number
  prevClose: number | null
  provider: QuoteProviderName
  providerTs: Date | null
  /**
   * When the tick wrote the anchor. Distinct from `providerTs`, which is the
   * provider's own clock — the gap between them is the pipeline's own latency,
   * and provenance reports both.
   */
  fetchedAt: Date
  /** Direction of the last *anchor* change, not of the current frame. */
  direction: 'up' | 'down' | 'flat'
  /** Where the current tween started from. */
  from: number
  /** `performance.now()` at the start of the current tween. */
  startedAt: number
  /**
   * Bumped only when an anchor genuinely changed. Drives the flash, so a tick
   * that rewrites the same price does not pretend to be an up-tick.
   */
  flashKey: number
}

/** What a server row — seeded or streamed — carries into the store. */
export type ServerQuote = {
  symbol: string
  ltp: number | null
  prevClose: number | null
  provider: QuoteProviderName | null
  providerTs: string | null
  fetchedAt: string | null
}

type QuoteState = {
  quotes: Record<string, LiveQuote>
  /**
   * Adopt server-rendered rows as anchors without flashing or tweening. Called
   * once on mount: the visitor did not watch these prices arrive, so animating
   * them would be theatre.
   */
  seedQuotes: (rows: ServerQuote[]) => void
  /**
   * Apply one Realtime payload.
   *
   * `animate` defaults to whether the tab is actually visible. It is a
   * parameter rather than a bare call to `document` so tier 1 — which runs in
   * node with no DOM at all — can drive both branches instead of silently
   * exercising only the jump.
   */
  applyServerQuote: (row: ServerQuote, options?: { animate?: boolean }) => void
  /** Advance every in-flight tween. Called by the one rAF driver. */
  advance: (now: number) => void
}

/**
 * Whether it is worth animating at all.
 *
 * A hidden tab gets no `requestAnimationFrame` callbacks — the browser stops
 * them entirely — so a tween started there would freeze at its first value and
 * leave a stale price on screen until the visitor came back. Jumping straight to
 * the anchor is both cheaper and more honest: nobody is watching the motion, and
 * whoever returns should see the current price rather than the start of a tween
 * of something a minute old.
 */
function shouldAnimate(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible'
}

function directionOf(previous: number, next: number): LiveQuote['direction'] {
  if (next > previous) return 'up'
  if (next < previous) return 'down'
  return 'flat'
}

export const useQuoteStore = create<QuoteState>()((set) => ({
  quotes: {},

  seedQuotes: (rows) =>
    set((state) => {
      const quotes = { ...state.quotes }
      let changed = false

      for (const row of rows) {
        // A symbol with no quote row yet has no price at all. It must stay
        // absent rather than become a zero, so the row keeps its em dash.
        // No price, or no record of when it was fetched, means there is nothing
        // to vouch for — the row keeps its em dash rather than entering the
        // store as a number with no provenance behind it.
        if (row.ltp === null || row.provider === null || row.fetchedAt === null) continue
        // Never overwrite a live anchor with a *stale* server render — a seed
        // that ran after the first tick would visibly rewind the price. But
        // "already present" is not the same as "fresher", and skipping on
        // presence alone pinned a symbol to its first-ever seed for the whole
        // session: the store lives in the terminal layout and survives every
        // client-side navigation, so if the Realtime channel never delivers
        // (no token, CHANNEL_ERROR, the free tier's connection cap — each of
        // which only logs), every later server render carried a newer price
        // that could not get in. Compare the timestamps instead.
        const existing = state.quotes[row.symbol]
        const fetchedAt = new Date(row.fetchedAt)
        if (existing && fetchedAt.getTime() <= existing.fetchedAt.getTime()) continue

        quotes[row.symbol] = {
          anchor: row.ltp,
          ltp: row.ltp,
          prevClose: row.prevClose,
          provider: row.provider,
          providerTs: row.providerTs === null ? null : new Date(row.providerTs),
          fetchedAt,
          // No flash and no tween: the visitor did not watch this price arrive,
          // so animating it would be theatre. `flashKey` is carried forward
          // rather than reset, so adopting a fresher server row cannot make a
          // row flash as though a tick had landed.
          direction: 'flat',
          from: row.ltp,
          startedAt: 0,
          flashKey: existing?.flashKey ?? 0,
        }
        changed = true
      }

      return changed ? { quotes } : state
    }),

  applyServerQuote: (row, options) =>
    set((state) => {
      if (row.ltp === null || row.provider === null || row.fetchedAt === null) return state
      const previous = state.quotes[row.symbol]
      const moved = previous !== undefined && previous.anchor !== row.ltp
      const tween = moved && (options?.animate ?? shouldAnimate())

      return {
        quotes: {
          ...state.quotes,
          [row.symbol]: {
            anchor: row.ltp,
            // The tween starts from whatever is currently on screen, not from
            // the old anchor — a tick landing mid-tween must continue from
            // where the eye last saw the number, not jump back.
            ltp: tween ? (previous?.ltp ?? row.ltp) : row.ltp,
            from: tween ? (previous?.ltp ?? row.ltp) : row.ltp,
            startedAt: tween ? performance.now() : 0,
            prevClose: row.prevClose,
            provider: row.provider,
            providerTs: row.providerTs === null ? null : new Date(row.providerTs),
            fetchedAt: new Date(row.fetchedAt),
            direction: moved ? directionOf(previous.anchor, row.ltp) : 'flat',
            flashKey: (previous?.flashKey ?? 0) + (moved ? 1 : 0),
          },
        },
      }
    }),

  advance: (now) =>
    set((state) => {
      let quotes: Record<string, LiveQuote> | null = null

      for (const [symbol, quote] of Object.entries(state.quotes)) {
        if (quote.ltp === quote.anchor) continue

        const elapsed = now - quote.startedAt
        const next = isTweening(elapsed) ? tweenAt(quote.from, quote.anchor, elapsed) : quote.anchor
        if (next === quote.ltp) continue

        // Only the entries that actually moved get a new object identity. A
        // wholesale rebuild every frame would hand every per-symbol selector a
        // fresh reference and re-render the entire sidebar sixty times a
        // second — the re-render storm `library-docs.md` warns about.
        quotes ??= { ...state.quotes }
        quotes[symbol] = { ...quote, ltp: next }
      }

      return quotes === null ? state : { quotes }
    }),
}))

/** True while at least one price still has distance to travel. */
export function hasActiveTween(quotes: Record<string, LiveQuote>): boolean {
  return Object.values(quotes).some((quote) => quote.ltp !== quote.anchor)
}

export { TWEEN_DURATION_MS }
