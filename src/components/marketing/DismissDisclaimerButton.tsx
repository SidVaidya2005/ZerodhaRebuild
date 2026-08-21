'use client'

import { X } from 'lucide-react'

import { DISCLAIMER_ATTRIBUTE, DISCLAIMER_DISMISSED, DISCLAIMER_STORAGE_KEY } from '@/lib/constants'

/**
 * The only client code in the disclaimer. It writes the same attribute the
 * root layout's blocking script writes, so dismissal takes effect through the
 * one CSS rule in both cases and this component never needs to know whether the
 * banner is currently visible — no state, no effect, no hydration mismatch.
 */
export function DismissDisclaimerButton() {
  function dismiss() {
    document.documentElement.setAttribute(DISCLAIMER_ATTRIBUTE, DISCLAIMER_DISMISSED)
    try {
      localStorage.setItem(DISCLAIMER_STORAGE_KEY, DISCLAIMER_DISMISSED)
    } catch {
      // Private browsing can refuse the write. The banner still closes for this
      // page view; it simply returns on the next one, which is the safe failure.
    }
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      aria-label="Dismiss the simulator notice"
      className="-my-1 shrink-0 rounded-sm p-1 text-muted transition-colors hover:text-body focus-visible:ring-2 focus-visible:ring-info/50 focus-visible:outline-none"
    >
      <X className="size-3.5" />
    </button>
  )
}
