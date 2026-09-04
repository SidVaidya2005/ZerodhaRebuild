'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { modifyOrderSchema, type ModifyOrderInput } from '@/lib/trading/schemas'
import type { OrderRow } from '@/lib/trading/types'
import { modifyOrder } from '@/server/actions/orders'

/**
 * Changes an open order's quantity and limit price.
 *
 * **Opened from its own `DialogTrigger`, not from a store.** That is what makes
 * this the simple case: Radix returns focus to the trigger by itself, so the
 * `onCloseAutoFocus` dance the order ticket needs — it is mounted once and opened
 * imperatively, so it has no trigger to return to — does not apply here. Each row
 * owns its own dialog, and a row's dialog is only mounted while that row is.
 *
 * No margin estimate panel. The order ticket shows one because a new order can be
 * refused for want of funds and the user has no other way to find out; a modify
 * that cannot be covered is rolled back whole by `modify_order` and reports so in
 * copy that says the original order is untouched. Recomputing §6's reservation
 * here to preview a number would be a second implementation of it in TypeScript,
 * which is the thing `constraints.md` rules out.
 */
export function ModifyOrderDialog({ order }: { order: OrderRow }) {
  const [open, setOpen] = useState(false)

  const { control, register, handleSubmit, formState, reset } = useForm<ModifyOrderInput>({
    resolver: zodResolver(modifyOrderSchema),
    defaultValues: {
      orderId: order.id,
      quantity: order.quantity,
      limitPrice: order.limitPrice,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    const result = await modifyOrder(values)

    if (!result.ok) {
      toast.error(result.error.message)
      // The dialog stays open on a failure, unlike the order ticket's. Nothing
      // was filed — `modify_order` rolled the attempt back — so the form is
      // still the user's live intent and closing it would throw away an edit
      // they can fix by lowering the quantity.
      return
    }

    toast.success(`Order updated — ${values.quantity} ${order.symbol}.`)
    setOpen(false)
  })

  function onOpenChange(next: boolean) {
    // Reset to the order's stored terms on every open, so a dialog reopened
    // after a failed attempt shows what is actually working rather than the
    // edit that was refused.
    if (next) reset({ orderId: order.id, quantity: order.quantity, limitPrice: order.limitPrice })
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Modify ${order.side.toLowerCase()} order for ${order.quantity} ${order.symbol}`}
        >
          Modify
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>
            Modify {order.side} {order.symbol}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`modify-quantity-${order.id}`} className="text-caption text-muted">
              Quantity
            </label>
            <Input
              id={`modify-quantity-${order.id}`}
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              aria-invalid={formState.errors.quantity ? true : undefined}
              {...register('quantity', { valueAsNumber: true })}
            />
            {formState.errors.quantity ? (
              <p role="alert" className="text-caption text-body">
                {formState.errors.quantity.message}
              </p>
            ) : null}
          </div>

          {/* Only a LIMIT order has one. A MARKET order cannot rest in OPEN, so
              in practice this branch is always taken — but the field is driven
              off the row rather than assumed, because `modify_order` refuses a
              price that does not match the stored order type. */}
          {order.orderType === 'LIMIT' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`modify-price-${order.id}`} className="text-caption text-muted">
                Limit price
              </label>
              {/* An uncontrolled number input has no single "empty" value —
                  '', null, undefined and NaN all reach the schema depending on
                  who wrote last — so the empty case is mapped at the field, as
                  the order ticket does. */}
              <Controller
                control={control}
                name="limitPrice"
                render={({ field }) => (
                  <Input
                    id={`modify-price-${order.id}`}
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

          <DialogFooter>
            {/* Disabled while in flight: a double-submitted modify would issue a
                second release-and-reserve against terms the first is still
                writing. */}
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
