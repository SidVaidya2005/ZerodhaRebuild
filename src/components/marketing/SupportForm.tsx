'use client'

import { useActionState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { submitSupportMessage, type SupportFormState } from '@/server/actions/support'

const CATEGORIES = [
  { value: 'account', label: 'Account' },
  { value: 'orders', label: 'Orders' },
  { value: 'funds', label: 'Funds' },
  { value: 'technical', label: 'Technical' },
] as const

/**
 * Driven by React 19's form action rather than react-hook-form, so it submits
 * and validates **without JavaScript** — the browser posts the FormData, the
 * action runs, and the returned state renders. That matters on this page in
 * particular, where the FAQ beside it ships no JS at all.
 *
 * `useActionState` supplies `isPending` for the disabled state, so nothing here
 * tracks submission by hand.
 *
 * A native `<select>` rather than the shadcn Select primitive: that one is a
 * Client Component that writes to a hidden input, and it does not submit at all
 * without JavaScript, which would undo the point of the above.
 */
export function SupportForm() {
  const [state, action, isPending] = useActionState<SupportFormState, FormData>(
    submitSupportMessage,
    null
  )

  if (state?.ok) {
    return (
      <div
        role="status"
        className="rounded-xl border border-hairline bg-surface p-6 text-body-sm text-body"
      >
        <p className="text-title-sm font-semibold text-ink">Message sent</p>
        <p className="mt-2">
          Thanks — it is stored, and that is genuinely all that happens to it. There is no support
          desk behind this, so a reply is not guaranteed.
        </p>
      </div>
    )
  }

  const fieldErrors = state?.ok === false ? (state.error.fields ?? {}) : {}
  const formError = state?.ok === false && !state.error.fields ? state.error.message : null

  return (
    <form action={action} noValidate className="flex max-w-prose flex-col gap-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-md border border-hairline bg-surface p-3 text-body-sm text-body"
        >
          {formError}
        </p>
      ) : null}

      <Field id="name" label="Your name" error={fieldErrors.name}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          maxLength={100}
          required
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? 'name-error' : undefined}
        />
      </Field>

      <Field id="email" label="Email" error={fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
        />
      </Field>

      <Field id="category" label="What is it about?" error={fieldErrors.category}>
        <select
          id="category"
          name="category"
          defaultValue="account"
          required
          aria-invalid={Boolean(fieldErrors.category)}
          aria-describedby={fieldErrors.category ? 'category-error' : undefined}
          className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-body-sm text-body focus-visible:ring-2 focus-visible:ring-info/50 focus-visible:outline-none"
        >
          {CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </Field>

      <Field id="message" label="Message" error={fieldErrors.message}>
        <Textarea
          id="message"
          name="message"
          rows={6}
          maxLength={2000}
          required
          aria-invalid={Boolean(fieldErrors.message)}
          aria-describedby={fieldErrors.message ? 'message-error' : undefined}
        />
      </Field>

      {/* Honeypot. Hidden from sight and from assistive technology, and never
          focusable, so no human fills it and a naive bot fills everything. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <Button type="submit" disabled={isPending} className="rounded-full">
          {isPending ? 'Sending…' : 'Send message'}
        </Button>
      </div>
    </form>
  )
}

type FieldProps = {
  id: string
  label: string
  error?: string
  children: ReactNode
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body-sm font-medium text-body">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-caption text-body">
          {error}
        </p>
      ) : null}
    </div>
  )
}
