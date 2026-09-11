import { formatCurrency, formatQuantity } from '@/lib/utils'

/**
 * What the user already has in this symbol, if anything.
 *
 * Read from `portfolio_holdings` and `portfolio_positions`, both of which do
 * their own arithmetic in Postgres — this component selects and formats and does
 * not add two numbers together.
 *
 * Renders nothing at all when there is no exposure. An empty "you hold 0"
 * card is noise on the 197 symbols a user has never traded.
 */

export type StockPositionProps = {
  holding: { quantity: number; averagePrice: number } | null
  position: { quantity: number; averagePrice: number } | null
}

export function StockPosition({ holding, position }: StockPositionProps) {
  if (holding === null && position === null) return null

  return (
    <section
      aria-label="Your exposure in this symbol"
      className="rounded-lg border border-hairline bg-surface p-4"
    >
      <h2 className="mb-3 text-title-sm font-semibold text-ink">Your position</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {holding && (
          <>
            <div>
              <dt className="text-caption text-muted">Holdings (CNC)</dt>
              <dd className="text-number text-ink tabular-nums">
                {formatQuantity(holding.quantity)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted">Avg. cost</dt>
              <dd className="text-number text-ink tabular-nums">
                {formatCurrency(holding.averagePrice)}
              </dd>
            </div>
          </>
        )}
        {position && (
          <>
            <div>
              {/* A negative quantity is a short. `formatQuantity` renders the
                  sign, so the direction is in the figure rather than only in
                  the colour. */}
              <dt className="text-caption text-muted">Positions (MIS)</dt>
              <dd className="text-number text-ink tabular-nums">
                {formatQuantity(position.quantity)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted">Avg. price</dt>
              <dd className="text-number text-ink tabular-nums">
                {formatCurrency(position.averagePrice)}
              </dd>
            </div>
          </>
        )}
      </dl>
    </section>
  )
}
