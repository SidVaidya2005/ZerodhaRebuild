'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { FundsOverview } from '@/lib/funds/types'
import { resetAccount } from '@/server/actions/funds'
import { formatCurrency } from '@/lib/utils'

/**
 * Account reset, behind a confirmation that says exactly what it destroys.
 *
 * **Self-contained because F35 mounts the same control**, and its `**Verify:**`
 * requires reset from Settings to behave identically to reset from Funds. Page
 * -local markup here would guarantee a second implementation there, and two
 * copies of an irreversible action is how they drift.
 *
 * **The counts are read, not described.** `funds_overview` supplies them, so the
 * dialog says "8 orders, 4 trades" rather than "your trading history" — the
 * difference between a warning a user can weigh and one they skim. What
 * *survives* is stated too: §11 leaves `profiles`, `watchlist_items`,
 * `instruments` and `quotes` alone, and a user who thinks reset might take their
 * watchlist will not press the button.
 *
 * **Opened from its own `DialogTrigger`**, so Radix returns focus to it without
 * help — the simple case F25's store exists to handle for the order ticket,
 * which has no trigger.
 */
export function ResetAccountDialog({ overview }: { overview: FundsOverview }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  async function onConfirm() {
    setPending(true)
    const result = await resetAccount()
    setPending(false)

    if (!result.ok) {
      // The dialog stays open: nothing was destroyed, so the user's intent is
      // still live and closing it would hide the failure behind a page that
      // looks unchanged for the correct reason and the wrong one alike.
      toast.error(result.error.message)
      return
    }

    toast.success(`Account reset — balance back to ${formatCurrency(overview.openingBalance)}.`)
    setOpen(false)
  }

  const nothingToDelete =
    overview.orderCount === 0 &&
    overview.tradeCount === 0 &&
    overview.holdingCount === 0 &&
    overview.positionCount === 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Reset account
        </Button>
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-[420px]"
        // Focus lands on Cancel, not on the destructive button. A dialog that
        // opens with "Reset" focused turns a stray Enter into data loss.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Reset account?</DialogTitle>
          <DialogDescription>
            This cannot be undone. Your simulated account returns to exactly the state it was in
            when you signed up.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-body-sm">
          <div>
            <p className="font-medium text-ink">Permanently deleted</p>
            <ul className="mt-1 list-disc pl-5 text-muted-strong">
              <li>{count(overview.orderCount, 'order')}</li>
              <li>{count(overview.tradeCount, 'trade')}</li>
              <li>{count(overview.holdingCount, 'holding')}</li>
              <li>{count(overview.positionCount, 'open position')}</li>
              <li>{count(overview.ledgerCount, 'ledger entry', 'ledger entries')}</li>
            </ul>
          </div>

          {/* Stated as plainly as the deletions. A user who suspects their
              watchlist is at risk will not press the button. */}
          <div>
            <p className="font-medium text-ink">Kept</p>
            <p className="mt-1 text-muted-strong">
              Your profile, client ID and watchlist are untouched.
            </p>
          </div>

          <p className="text-muted-strong">
            Available cash returns to{' '}
            <span className="font-medium text-ink tabular-nums">
              {formatCurrency(overview.openingBalance)}
            </span>{' '}
            and used margin to {formatCurrency(0)}.
          </p>

          {nothingToDelete && (
            <p className="text-caption text-muted">
              This account has no trading history — resetting will only refresh the opening credit.
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button ref={cancelRef} variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? 'Resetting…' : 'Reset account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "1 order" / "4 trades" — a count nobody has to decode. */
function count(value: number, singular: string, plural?: string): string {
  return `${value} ${value === 1 ? singular : (plural ?? `${singular}s`)}`
}
