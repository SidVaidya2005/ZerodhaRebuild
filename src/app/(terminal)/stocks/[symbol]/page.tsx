import type { Metadata } from 'next'

import { TerminalPlaceholder } from '@/components/terminal/TerminalPlaceholder'

type StockPageProps = {
  params: Promise<{ symbol: string }>
}

export async function generateMetadata({ params }: StockPageProps): Promise<Metadata> {
  const { symbol } = await params
  return { title: `${symbol.toUpperCase()} — ZerodhaRebuild` }
}

/**
 * `/stocks/[symbol]` is dynamic and has no index: there is no useful page
 * listing 200 instruments, so this is reached by search or by clicking a symbol.
 * The symbol is echoed rather than looked up — validating it against
 * `instruments` is F33's, along with everything that makes the page worth
 * visiting.
 */
export default async function StockPage({ params }: StockPageProps) {
  const { symbol } = await params

  return (
    <TerminalPlaceholder
      title={symbol.toUpperCase()}
      arrivesIn="F33"
      description="Price chart, depth, fundamentals and the order ticket for this instrument."
    />
  )
}
