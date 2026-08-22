'use server'

import { revalidatePath } from 'next/cache'

import { TERMINAL_PREFIXES } from '@/lib/auth/routes'
import { createClient } from '@/lib/supabase/server'
import {
  addToWatchlistSchema,
  removeFromWatchlistSchema,
  reorderWatchlistSchema,
} from '@/lib/watchlist/schemas'
import type { ActionResult } from '@/types/domain'

/**
 * The watchlist's three write paths.
 *
 * Each one calls a database function rather than writing through PostgREST, for
 * a reason PostgREST cannot solve: `add_watchlist_item` has to read the current
 * maximum `sort_order` and insert in the same statement, and
 * `move_watchlist_item` has to renumber and then swap. Doing either as a read
 * followed by a write races — two concurrent adds read the same maximum and
 * collide on the primary key.
 *
 * The functions are invoker-rights, so RLS on `watchlist_items` is still the
 * boundary. They add set-based SQL, never privilege.
 */

/**
 * The watchlist rail lives in the `(terminal)` layout, so a change to it changes
 * every terminal route rather than the one the visitor happens to be on.
 *
 * `code-standards.md` says to list the routes explicitly rather than revalidate
 * the layout, so this walks the same table `src/proxy.ts` guards — which is also
 * what keeps the two from drifting. `/stocks` needs its dynamic form: a bare
 * prefix does not match `/stocks/RELIANCE`.
 */
function revalidateTerminal(): void {
  for (const prefix of TERMINAL_PREFIXES) {
    if (prefix === '/stocks') {
      revalidatePath('/stocks/[symbol]', 'page')
      continue
    }
    revalidatePath(prefix)
  }
}

const GENERIC_FAILURE = 'That did not save. Try again.'

export async function addToWatchlist(input: unknown): Promise<ActionResult<{ symbol: string }>> {
  const parsed = addToWatchlistSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'That is not a symbol.' } }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('add_watchlist_item', { p_symbol: parsed.data.symbol })

  if (error) {
    // Raw Postgres text is logged, never returned.
    console.error('[watchlist.addToWatchlist]', error)
    return { ok: false, error: { code: 'WRITE_FAILED', message: GENERIC_FAILURE } }
  }

  // Zero rows is not an error the database raises: an unknown symbol, a delisted
  // one, and one already on the list all come back as a quiet 0. Only the last
  // is worth staying silent about, and telling them apart here would leak
  // whether a symbol exists — so all three report the same nothing-happened.
  if (data === 0) {
    return {
      ok: false,
      error: {
        code: 'NOT_ADDED',
        message: 'That symbol is already on your watchlist, or is not tradable.',
      },
    }
  }

  revalidateTerminal()
  return { ok: true, data: { symbol: parsed.data.symbol } }
}

export async function removeFromWatchlist(
  input: unknown
): Promise<ActionResult<{ symbol: string }>> {
  const parsed = removeFromWatchlistSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'That is not a symbol.' } }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_watchlist_item', { p_symbol: parsed.data.symbol })

  if (error) {
    console.error('[watchlist.removeFromWatchlist]', error)
    return { ok: false, error: { code: 'WRITE_FAILED', message: GENERIC_FAILURE } }
  }

  // A zero here means it was already gone, which is the state the caller wanted.
  revalidateTerminal()
  return { ok: true, data: { symbol: parsed.data.symbol } }
}

export async function reorderWatchlist(input: unknown): Promise<ActionResult<{ moved: boolean }>> {
  const parsed = reorderWatchlistSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'A row moves up or down.' } }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('move_watchlist_item', {
    p_symbol: parsed.data.symbol,
    p_direction: parsed.data.direction,
  })

  if (error) {
    console.error('[watchlist.reorderWatchlist]', error)
    return { ok: false, error: { code: 'WRITE_FAILED', message: GENERIC_FAILURE } }
  }

  // Already at the end it was asked to move toward. The button is disabled
  // there, so this is a no-op rather than something to report.
  if (data === 0) return { ok: true, data: { moved: false } }

  revalidateTerminal()
  return { ok: true, data: { moved: true } }
}
