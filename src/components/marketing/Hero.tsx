import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { OPENING_BALANCE } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'

import { SIGN_IN_HREF } from './nav-links'

/**
 * Type and one call to action, no mock terminal. DESIGN.md tells this system to
 * carry a hero on colour-block contrast rather than decoration, and a hand-built
 * fake terminal would only have to be replaced by a real screenshot once the
 * terminal itself exists (F40).
 */
export function Hero() {
  return (
    <section className="py-section">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="max-w-3xl">
          <h1 className="text-display font-bold text-ink md:text-display-lg">
            Learn how Indian equity trading actually works — with nothing at stake.
          </h1>
          <p className="mt-6 max-w-prose text-title-sm font-normal text-muted-strong">
            A paper-trading terminal modelled on a real broker. Sign in with Google, start with{' '}
            <span className="font-numeric font-medium text-body">
              {formatCurrency(OPENING_BALANCE)}
            </span>{' '}
            of simulated cash, and trade around 200 NSE stocks against real market prices. Margin
            blocking, brokerage and STT, intraday square-off at 3:20pm — the mechanics behave, and
            none of the money is real.
          </p>
          <div className="mt-8">
            <Button asChild className="h-11 rounded-full px-6">
              <Link href={SIGN_IN_HREF}>Sign in with Google</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
