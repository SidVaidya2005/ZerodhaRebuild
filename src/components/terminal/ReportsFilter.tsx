import Link from 'next/link'

import {
  isActivePreset,
  reportsHref,
  type ReportsPreset,
  type ReportsQuery,
} from '@/lib/reports/query'
import { cn } from '@/lib/utils'

/**
 * The date-range and symbol filters.
 *
 * **A plain GET form and plain links, so the whole page stays a Server
 * Component** and every view has a URL a user can bookmark, share or reach with
 * the back button. A GET form writes its own querystring from the input `name`s
 * — there is nothing for JavaScript to do here, which is the same reasoning
 * F32's `LedgerFilter` used and F07's `<details>` FAQ before it.
 *
 * **Every control returns to page 1.** Page 4 of every trade is rarely page 4 of
 * one symbol, so carrying the page across a filter change lands the user on an
 * empty page that looks like an empty account (F32).
 */
export function ReportsFilter({
  query,
  presets,
  symbols,
  disabled,
}: {
  query: ReportsQuery
  presets: readonly ReportsPreset[]
  /** What this user has actually traded, from `traded_symbols`. */
  symbols: readonly { symbol: string; name: string }[]
  disabled?: boolean
}) {
  if (disabled) return null

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Filter trades by period" className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <Link
            key={preset.label}
            // The symbol survives a period change; the two filters are
            // independent and clearing one to change the other would be a
            // surprise.
            href={reportsHref({ ...preset.query, symbol: query.symbol })}
            aria-current={isActivePreset(preset, query) ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-caption focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
              isActivePreset(preset, query)
                ? 'border-transparent bg-surface-elevated font-medium text-ink'
                : 'border-hairline text-muted hover:text-ink'
            )}
          >
            {preset.label}
          </Link>
        ))}
      </nav>

      {/*
        `method="get"` and no `onSubmit`: the browser builds
        `?from=…&to=…&symbol=…` from the field names and navigates. Page is
        deliberately absent from the form, so submitting it returns to page 1.
      */}
      <form
        method="get"
        action="/reports"
        className="flex flex-wrap items-end gap-3 rounded-md border border-hairline bg-surface p-3"
      >
        <Field label="From" htmlFor="from">
          <input
            type="date"
            id="from"
            name="from"
            defaultValue={query.from ?? ''}
            className="h-9 rounded-xs border border-hairline bg-canvas px-2 text-body-sm text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          />
        </Field>

        <Field label="To" htmlFor="to">
          <input
            type="date"
            id="to"
            name="to"
            defaultValue={query.to ?? ''}
            className="h-9 rounded-xs border border-hairline bg-canvas px-2 text-body-sm text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          />
        </Field>

        {/* Drawn from what the user has traded rather than the whole universe:
            an option that matches nothing produces an empty page that reads as
            an empty account. */}
        <Field label="Symbol" htmlFor="symbol">
          <select
            id="symbol"
            name="symbol"
            defaultValue={query.symbol ?? ''}
            className="h-9 rounded-xs border border-hairline bg-canvas px-2 text-body-sm text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <option value="">All symbols</option>
            {/* A URL can name a symbol this user has never traded — a stale
                bookmark, or one whose trades a reset removed. Without an option
                for it the `<select>` falls back to showing "All symbols" while
                the table beside it is filtered to nothing, so the form states
                the opposite of what is being applied. Rendering it keeps the
                two honest; the empty state then explains the result. */}
            {query.symbol !== null && !symbols.some((s) => s.symbol === query.symbol) && (
              <option value={query.symbol}>{query.symbol}</option>
            )}
            {symbols.map((option) => (
              <option key={option.symbol} value={option.symbol}>
                {option.symbol}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          className="h-9 rounded-xs bg-brand px-4 text-body-sm font-medium text-canvas focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
        >
          Apply
        </button>

        {/* A link rather than a reset button: reset would restore the fields to
            their current values, which is not what "clear" means here. */}
        {(query.from !== null || query.to !== null || query.symbol !== null) && (
          <Link
            href="/reports"
            className="h-9 rounded-xs px-2 py-2 text-body-sm text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            Clear
          </Link>
        )}
      </form>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-caption text-muted">
        {label}
      </label>
      {children}
    </div>
  )
}
