'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidateTerminal } from '@/server/revalidate'
import type { ActionResult } from '@/types/domain'

/**
 * Restores the caller's account to the post-signup state.
 *
 * No SQL and no arithmetic of its own: `reset_account()` decides the whole
 * outcome per `trading-contract.md` §11 — every order, trade, holding, position
 * and ledger row deleted, cash and `opening_balance` back to
 * `opening_balance()`, `used_margin` zero, and one fresh `SIGNUP_CREDIT`. It
 * derives its user from `auth.uid()` rather than an argument, which is why it
 * can be granted to `authenticated` at all.
 *
 * **This action takes no input, so there is nothing to Zod-parse.**
 * `code-standards.md` requires every Server Action to validate its input before
 * touching the database; an action with no input satisfies that vacuously, and a
 * schema for `undefined` would be ceremony rather than a guard. Noted here
 * because that file also requires a deliberate deviation to say which rule and
 * why. The authorisation that matters is `auth.uid()` inside the function and
 * the RLS beneath it, neither of which this layer could add to.
 *
 * There is no business-rejection path: reset either happens or faults. So unlike
 * `placeOrder`, `error` being null is the whole success condition.
 */
export async function resetAccount(): Promise<ActionResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reset_account')

  if (error) {
    console.error('[funds.resetAccount]', error)
    return {
      ok: false,
      error: {
        code: 'UNKNOWN',
        // Mapped copy, never the Postgres text: the user cannot act on a
        // constraint name, and `code-standards.md` forbids surfacing one.
        message: 'The account could not be reset. Nothing was changed — try again.',
      },
    }
  }

  // A reset moves available_cash, used_margin and every list in the terminal,
  // so the chrome on every page is stale, not just this one.
  revalidateTerminal()
  return { ok: true, data: null }
}
