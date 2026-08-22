'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuoteStore } from '@/lib/stores/quote-store'
import {
  consumeTicketTrigger,
  useOrderTicketStore,
  type OrderTicketRequest,
} from '@/lib/stores/order-ticket-store'
import { createClient } from '@/lib/supabase/client'
import { estimateCharges, type OrderProduct } from '@/lib/trading/charges'
import { NO_EXPOSURE, estimateMargin, type SymbolExposure } from '@/lib/trading/margin'
import { ORDER_ERROR_COPY, orderPlacedMessage } from '@/lib/trading/order-copy'
import { placeOrderSchema, type PlaceOrderInput, type PlacedOrder } from '@/lib/trading/schemas'
import type { ActionResult } from '@/types/domain'
import { cn, formatCurrency, formatQuantity } from '@/lib/utils'

/**
 * The order ticket.
 *
 * **Every money figure here is an estimate**, and says so. `trading-contract.md`
 * §1 permits TypeScript to show a clearly-labelled estimate and forbids it
 * producing a stored value — the figures that get written come from
 * `execute_order`, and `pnpm test:parity` proves this arithmetic equal to it.
 *
 * The seam with F26 is `onSubmit`: this component owns the form, the validation
 * and the in-flight guard, and knows nothing about Server Actions. That keeps
 * the whole ticket testable with no database, and the double-submit guard is a
 * UI concern that belongs here either way.
 */

export type OrderTicketProps = {
  /** From the layout's `funds` read. Null when that read failed. */
  availableCash: number | null
  /** F26's `placeOrder`. Typed to its result, because the toast names the fill. */
  onSubmit?: (values: PlaceOrderInput) => Promise<ActionResult<PlacedOrder>>
  /**
   * Overrides the position fetch. Tests inject a resolved exposure; nothing in
   * the app passes this.
   */
  loadExposure?: (symbol: string) => Promise<SymbolExposure>
}

/** `—` rather than `0.00`. A zero is a figure; absence is not. */
const DASH = '—'

/**
 * One RLS-scoped read of what the user already has in this symbol.
 *
 * Fetched when the ticket opens rather than server-rendered into every terminal
 * page: it is one round trip per open instead of a portfolio loaded on pages
 * where the ticket never appears, and it is fresh — it reflects a fill that
 * happened on another tab thirty seconds ago, which is exactly when the figure
 * matters.
 */
async function fetchExposure(symbol: string): Promise<SymbolExposure> {
  const supabase = createClient()

  const [{ data: holding }, { data: position }] = await Promise.all([
    supabase.from('holdings').select('quantity').eq('symbol', symbol).maybeSingle(),
    supabase
      .from('positions')
      .select('net_quantity')
      .eq('symbol', symbol)
      .eq('product', 'MIS')
      .maybeSingle(),
  ])

  return {
    holding: holding?.quantity ?? 0,
    netQuantity: position?.net_quantity ?? 0,
  }
}

function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-sm border border-hairline p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 rounded-[3px] px-3 py-1.5 text-body-sm transition-colors',
            value === option.value
              ? 'bg-surface-elevated font-medium text-ink'
              : 'text-muted hover:text-ink'
          )}
        >
          {option.label}
          {option.hint ? <span className="ml-1 text-caption text-muted">{option.hint}</span> : null}
        </button>
      ))}
    </div>
  )
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'default' | 'strong'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-body-sm text-muted">{label}</span>
      <span
        className={cn(
          'font-mono text-body-sm tabular-nums',
          tone === 'strong' ? 'font-medium text-ink' : 'text-ink'
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * The form itself, **keyed by the request** so opening the ticket on a new
 * symbol remounts it.
 *
 * That key is what replaces an effect that reset the fields and cleared the
 * exposure on every open: resetting state by changing a key is React's own
 * answer, and the effect version called `setState` synchronously in an effect
 * body — cascading renders, and an eslint error that is right to be one.
 */
function TicketForm({
  request,
  availableCash,
  onSubmit,
  loadExposure,
  closeTicket,
}: {
  request: OrderTicketRequest
  availableCash: number | null
  onSubmit?: (values: PlaceOrderInput) => Promise<ActionResult<PlacedOrder>>
  loadExposure?: (symbol: string) => Promise<SymbolExposure>
  closeTicket: () => void
}) {
  const [exposure, setExposure] = useState<SymbolExposure | null>(null)

  const symbol = request.symbol

  // The live price, so a MARKET order's estimate moves with the price it will
  // fill at. Selected as a primitive: subscribing to the quote object would
  // re-render this dialog on every interpolation frame.
  const ltp = useQuoteStore((state) => (symbol ? (state.quotes[symbol]?.ltp ?? null) : null))

  const form = useForm({
    resolver: zodResolver(placeOrderSchema),
    mode: 'onSubmit',
    defaultValues: {
      symbol: request.symbol,
      side: request.side,
      orderType: 'MARKET' as const,
      product: request.product ?? ('CNC' as OrderProduct),
      quantity: request.quantity ?? 1,
      limitPrice: null,
    },
  })

  const { control, formState, handleSubmit, register, setValue } = form

  // `useWatch`, not `watch()`. The latter returns a function the React Compiler
  // cannot memoize safely, so it skips optimising this whole component and warns
  // — and the fields below are read on every keystroke to recompute the
  // estimate, which is exactly the render path that wants optimising.
  const side = useWatch({ control, name: 'side' })
  const product = useWatch({ control, name: 'product' })
  const orderType = useWatch({ control, name: 'orderType' })
  const quantity = useWatch({ control, name: 'quantity' })
  const limitPrice = useWatch({ control, name: 'limitPrice' })

  // Fetched per open, and guarded against arriving after the user has moved on
  // — an await that resolves late must not overwrite the exposure of a ticket it
  // no longer describes. Setting state from an async callback is the shape
  // effects are for; the reset above is not, which is why it is a key instead.
  useEffect(() => {
    let current = true
    const load = loadExposure ?? fetchExposure

    void load(symbol)
      .then((result) => {
        if (current) setExposure(result)
      })
      .catch((error: unknown) => {
        console.error('[OrderTicket] exposure', error)
        // Fall back to "nothing open", which is the conservative reading: it
        // over-states the margin for a cover rather than under-stating it.
        if (current) setExposure(NO_EXPOSURE)
      })

    return () => {
      current = false
    }
  }, [symbol, loadExposure])

  // The price the estimate is computed against: §6 says `limit_price` for a
  // limit order and the current `ltp` for a market one.
  const price = orderType === 'LIMIT' ? (limitPrice ?? null) : ltp

  const estimate = useMemo(() => {
    if (price === null || price <= 0 || !Number.isFinite(quantity) || quantity <= 0) return null

    return {
      margin: estimateMargin({
        side,
        product,
        quantity,
        price,
        exposure: exposure ?? NO_EXPOSURE,
      }),
      charges: estimateCharges({ side, product, quantity, price }),
    }
  }, [side, product, quantity, price, exposure])

  const isBuy = side === 'BUY'

  /**
   * Every outcome closes the ticket and says what happened in a toast.
   *
   * A rejection closes too, and that is deliberate: `place_order` has already
   * filed the order as `REJECTED`, so the row exists and F27 lists it. Leaving
   * the dialog open would imply it is still editable, and each retry would file
   * another order rather than amend the first.
   */
  async function submit(values: PlaceOrderInput) {
    if (!onSubmit) {
      // No action wired. Closing is the honest outcome — pretending an order
      // was placed would be worse than doing nothing visibly.
      closeTicket()
      return
    }

    let result: ActionResult<PlacedOrder>
    try {
      result = await onSubmit(values)
    } catch (error) {
      // A transport failure, not an answer: the request may or may not have
      // reached `place_order`. The copy says exactly that, because telling
      // someone to retry could double-place and telling them it failed could be
      // a lie.
      console.error('[OrderTicket.submit]', error)
      toast.error(ORDER_ERROR_COPY.UNCONFIRMED)
      closeTicket()
      return
    }

    if (result.ok) {
      toast.success(orderPlacedMessage(result.data))
    } else {
      toast.error(result.error.message)
    }
    closeTicket()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {/* Uncoloured on purpose. The side selector below is filled green or
              red and is the one place this screen spends the trading tokens;
              tinting the title too would spend them on a label rather than on
              a control, which is what `DESIGN.md` reserves them for. */}
          <span className="font-medium">{isBuy ? 'Buy' : 'Sell'}</span>
          <span>{symbol}</span>
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
        {/* The only place the trading colours appear. `DESIGN.md` reserves
              them for explicit price-direction meaning, so the confirm action
              below is the brand CTA rather than a green "Buy" button. */}
        <div role="group" aria-label="Side" className="flex gap-2">
          {(['BUY', 'SELL'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={side === option}
              onClick={() => setValue('side', option)}
              className={cn(
                'flex-1 rounded-sm px-5 py-2 text-body-sm font-medium transition-colors',
                side === option
                  ? option === 'BUY'
                    ? 'bg-up text-on-dark'
                    : 'bg-down text-on-dark'
                  : 'border border-hairline text-muted hover:text-ink'
              )}
            >
              {option === 'BUY' ? 'Buy' : 'Sell'}
            </button>
          ))}
        </div>

        <SegmentedToggle
          label="Product"
          value={product}
          onChange={(value) => setValue('product', value)}
          options={[
            { value: 'CNC', label: 'CNC', hint: 'delivery' },
            { value: 'MIS', label: 'MIS', hint: 'intraday' },
          ]}
        />

        <SegmentedToggle
          label="Order type"
          value={orderType}
          onChange={(value) => {
            setValue('orderType', value)
            // The schema refuses a market order carrying a price, mirroring
            // `orders_limit_price_iff_limit`, so the field is cleared rather
            // than left holding a stale figure the user cannot see. Seeded from
            // the live price only when there IS one: `ltp` is null for a symbol
            // with no quote — which is every symbol outside a session — and a
            // non-positive seed puts a figure in the field that the schema then
            // rejects as a bad price rather than as an absence.
            setValue('limitPrice', value === 'LIMIT' && ltp !== null && ltp > 0 ? ltp : null)
          }}
          options={[
            { value: 'MARKET', label: 'Market' },
            { value: 'LIMIT', label: 'Limit' },
          ]}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="order-quantity" className="text-body-sm text-muted">
              Quantity
            </label>
            <Input
              id="order-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              aria-invalid={formState.errors.quantity ? true : undefined}
              {...register('quantity', { valueAsNumber: true })}
            />
            {formState.errors.quantity ? (
              <p role="alert" className="text-caption text-body">
                {formState.errors.quantity.message}
              </p>
            ) : null}
          </div>

          {orderType === 'LIMIT' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="order-limit-price" className="text-body-sm text-muted">
                Limit price
              </label>
              {/* Controlled, so the empty-to-null mapping is written here
                  rather than inferred from react-hook-form's coercion. An
                  uncontrolled `type="number"` field has no single "empty" value
                  — `''`, `null`, `undefined` and `NaN` all occur depending on
                  whether the user or `setValue` wrote it last — and depending on
                  which one arrived told a user who had typed nothing that their
                  price must be more than zero, because `Number(null)` is 0. */}
              <Controller
                control={control}
                name="limitPrice"
                render={({ field }) => (
                  <Input
                    id="order-limit-price"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    aria-invalid={formState.errors.limitPrice ? true : undefined}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value
                      field.onChange(raw === '' ? null : Number(raw))
                    }}
                  />
                )}
              />
              {formState.errors.limitPrice ? (
                <p role="alert" className="text-caption text-body">
                  {formState.errors.limitPrice.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Everything below is an estimate, and the heading says so once so
              each row does not have to. */}
        <section
          aria-label="Estimated cost"
          className="flex flex-col gap-2 rounded-sm border border-hairline bg-surface-elevated p-3"
        >
          <h3 className="text-caption text-muted uppercase">Estimate</h3>

          {exposure === null ? (
            <div className="flex flex-col gap-2" aria-hidden>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <>
              <Figure
                label="Margin required"
                tone="strong"
                value={estimate ? formatCurrency(estimate.margin.required) : DASH}
              />
              {estimate && estimate.margin.collateral > 0 ? (
                <Figure
                  label={`Collateral on ${formatQuantity(estimate.margin.openingQuantity)} short`}
                  value={formatCurrency(estimate.margin.collateral)}
                />
              ) : null}
              {estimate && estimate.margin.closingQuantity > 0 ? (
                <p className="text-caption text-muted">
                  {formatQuantity(estimate.margin.closingQuantity)} of this order closes an open
                  position, so it needs no fresh margin.
                </p>
              ) : null}
              <Figure
                label="Charges"
                value={estimate ? formatCurrency(estimate.charges.total) : DASH}
              />
              <ul className="flex flex-col gap-1 border-t border-hairline pt-2">
                {estimate
                  ? (
                      [
                        ['Brokerage', estimate.charges.breakdown.brokerage],
                        ['STT', estimate.charges.breakdown.stt],
                        ['Exchange', estimate.charges.breakdown.exchangeTxn],
                        ['SEBI', estimate.charges.breakdown.sebiTurnover],
                        ['Stamp duty', estimate.charges.breakdown.stampDuty],
                        ['DP charge', estimate.charges.breakdown.dpCharge],
                        ['GST', estimate.charges.breakdown.gst],
                      ] as const
                    )
                      .filter(([, value]) => value > 0)
                      .map(([label, value]) => (
                        <li key={label} className="flex justify-between gap-4 text-caption">
                          <span className="text-muted">{label}</span>
                          <span className="font-mono text-muted tabular-nums">
                            {formatCurrency(value)}
                          </span>
                        </li>
                      ))
                  : null}
              </ul>
            </>
          )}
        </section>

        {/* Outside the estimate section on purpose. This one is not an
            estimate: it is `funds.available_cash`, computed in Postgres and
            read straight out. §1 asks TypeScript to label what it works out
            for itself — labelling a figure the database owns as an estimate
            would be just as inaccurate, in the other direction. */}
        <div className="flex justify-between gap-4 px-3 text-body-sm">
          <span className="text-muted">Available cash</span>
          <span className="font-mono tabular-nums">
            {availableCash === null ? DASH : formatCurrency(availableCash)}
          </span>
        </div>

        {/* The brand CTA, not a trading colour: `DESIGN.md` forbids green and
              red on a general confirm because they carry price-direction
              meaning. `isSubmitting` is what makes a double click one order —
              react-hook-form holds it true for the whole await. */}
        <Button
          type="submit"
          disabled={formState.isSubmitting}
          className="bg-brand text-on-brand hover:bg-brand/90"
        >
          {formState.isSubmitting ? 'Placing…' : `${isBuy ? 'Buy' : 'Sell'} ${symbol}`}
        </Button>
      </form>
    </>
  )
}

export function OrderTicket({ availableCash, onSubmit, loadExposure }: OrderTicketProps) {
  const request = useOrderTicketStore((state) => state.request)
  const closeTicket = useOrderTicketStore((state) => state.closeTicket)

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && closeTicket()}>
      <DialogContent
        className="sm:max-w-md"
        // Radix restores focus to its `DialogTrigger`, and there is none here:
        // the ticket is opened from a store so that one dialog serves every
        // call site. Without this, closing dropped focus on `<body>` and a
        // keyboard user landed back at the top of the document.
        onCloseAutoFocus={(event) => {
          const trigger = consumeTicketTrigger()
          // A row can be gone by the time the ticket closes — removed from the
          // watchlist, or navigated away from. Radix's default is the better
          // answer then than focusing a detached node.
          if (!trigger?.isConnected) return
          event.preventDefault()
          trigger.focus()
        }}
      >
        {request ? (
          <TicketForm
            key={`${request.symbol}:${request.side}`}
            request={request}
            availableCash={availableCash}
            onSubmit={onSubmit}
            loadExposure={loadExposure}
            closeTicket={closeTicket}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
