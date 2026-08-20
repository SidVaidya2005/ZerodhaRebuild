import { notFound } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  formatCurrency,
  formatQuantity,
  formatSignedCurrency,
  formatSignedPercent,
} from '@/lib/utils'

import { Swatch } from './swatch'
import { ThemeToggle } from './theme-toggle'

// Tailwind's scanner reads complete class strings out of the source, so an
// interpolated `bg-chart-${n}` generates nothing at all. Both scales are literal.
const CHART_RAMP = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-chart-6',
  'bg-chart-7',
  'bg-chart-8',
  'bg-chart-9',
  'bg-chart-10',
] as const

const RADIUS_SCALE = [
  { label: 'xs', className: 'rounded-xs' },
  { label: 'sm', className: 'rounded-sm' },
  { label: 'md', className: 'rounded-md' },
  { label: 'lg', className: 'rounded-lg' },
  { label: 'xl', className: 'rounded-xl' },
] as const

// A build tool, not a product surface. It sits outside both the (marketing) and
// (terminal) route groups, so proxy.ts will never guard it — without this it
// would be a public URL on the deployed site.
export default function StyleguidePage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const holdings = [
    { symbol: 'RELIANCE', qty: 25, avg: 2847.5, ltp: 2913.25 },
    { symbol: 'TCS', qty: 8, avg: 4102.0, ltp: 4055.8 },
    { symbol: 'HDFCBANK', qty: 140, avg: 1678.35, ltp: 1712.9 },
    { symbol: 'INFY', qty: 60, avg: 1893.7, ltp: 1846.15 },
  ]

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-12 flex items-center justify-between border-b border-hairline pb-6">
        <div>
          <h1 className="text-display-sm font-semibold text-ink">Styleguide</h1>
          <p className="text-body text-muted">
            Every token in both themes. Dev-only — this route 404s in production.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section
        title="Brand"
        note="One accent carries every primary action. There is no second brand colour."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Swatch token="bg-brand" className="bg-brand" note="primary CTA" />
          <Swatch token="bg-brand-active" className="bg-brand-active" note="hover / press" />
          <Swatch token="bg-brand-disabled" className="bg-brand-disabled" note="dark canvas only" />
          <Swatch token="bg-on-brand" className="bg-on-brand" note="black on yellow" />
        </div>
        <p className="mt-4 text-caption text-muted">
          Brand and trading colours are byte-identical in both themes — asserted in
          <code className="font-numeric"> theme-tokens.test.ts</code>, not by eye.
        </p>
      </Section>

      <Section
        title="Trading semantics"
        note="Fixed meaning everywhere. Never decorative, never a category colour."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Swatch token="text-up" className="bg-up" note="price rose" />
          <Swatch token="text-down" className="bg-down" note="price fell" />
        </div>
      </Section>

      <Section title="Surfaces">
        <div className="grid gap-4 sm:grid-cols-2">
          <Swatch token="bg-canvas" className="bg-canvas" note="page floor" />
          <Swatch token="bg-surface" className="bg-surface" note="cards, dropdowns" />
          <Swatch token="bg-surface-elevated" className="bg-surface-elevated" note="hovered rows" />
          <Swatch token="border-hairline" className="bg-hairline" note="1px borders" />
        </div>
      </Section>

      <Section title="Text">
        <div className="grid gap-4 sm:grid-cols-2">
          <Swatch token="text-ink" className="bg-ink" note="headlines" />
          <Swatch token="text-body" className="bg-body" note="running text" />
          <Swatch token="text-muted" className="bg-muted" note="captions, column headers" />
          <Swatch token="text-muted-strong" className="bg-muted-strong" />
        </div>
      </Section>

      <Section title="Chart ramp" note="Ten categorical colours, deliberately excluding up/down.">
        <div className="flex flex-wrap gap-2">
          {CHART_RAMP.map((className, i) => (
            <div key={className} className="text-center">
              <div className={`size-10 rounded-md ${className}`} />
              <code className="font-numeric text-caption text-muted">{i + 1}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type scale" note="Inter for editorial copy, IBM Plex Sans for every number.">
        <div className="space-y-3">
          <p className="text-hero font-bold text-ink">Hero 64</p>
          <p className="text-display-lg font-bold text-ink">Display lg 48</p>
          <p className="text-display font-semibold text-ink">Display 40</p>
          <p className="text-display-sm font-semibold text-ink">Display sm 32</p>
          <p className="text-title-lg font-semibold text-ink">Title lg 24</p>
          <p className="text-title font-semibold text-ink">Title 20</p>
          <p className="text-title-sm font-semibold text-ink">Title sm 16</p>
          <p className="text-body">Body 14 — default running text, Inter.</p>
          <p className="text-body-sm text-body">Body sm 13 — footer and consent copy.</p>
          <p className="text-caption text-muted">Caption 12 — column headers and meta labels.</p>
          <p className="font-numeric text-number-display font-bold text-brand">₹4,29,423.44</p>
        </div>
      </Section>

      <Section title="Radius">
        <div className="flex flex-wrap items-end gap-4">
          {RADIUS_SCALE.map(({ label, className }) => (
            <div key={label} className="text-center">
              <div className={`size-16 border border-hairline bg-surface ${className}`} />
              <code className="font-numeric text-caption text-muted">{label}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
        <p className="mt-4 text-caption text-muted">
          Buy and sell are the trading colours at the tighter radius, never the brand CTA.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="h-8 rounded-sm bg-up px-5 text-caption font-semibold text-canvas">
            B
          </button>
          <button className="h-8 rounded-sm bg-down px-5 text-caption font-semibold text-canvas">
            S
          </button>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-sm gap-3">
          <Input placeholder="Search stocks…" />
          <Input placeholder="Disabled" disabled />
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="open">
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="executed">Executed</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>
          <TabsContent value="open" className="pt-4 text-body text-muted">
            Open orders would list here.
          </TabsContent>
          <TabsContent value="executed" className="pt-4 text-body text-muted">
            Executed orders.
          </TabsContent>
          <TabsContent value="cancelled" className="pt-4 text-body text-muted">
            Cancelled orders.
          </TabsContent>
        </Tabs>
      </Section>

      <Section
        title="Table density and numeric alignment"
        note="Every figure is tabular — the decimal points must form a straight column."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-caption text-muted">Instrument</TableHead>
              <TableHead className="text-right text-caption text-muted">Qty</TableHead>
              <TableHead className="text-right text-caption text-muted">Avg cost</TableHead>
              <TableHead className="text-right text-caption text-muted">LTP</TableHead>
              <TableHead className="text-right text-caption text-muted">P&amp;L</TableHead>
              <TableHead className="text-right text-caption text-muted">Chg</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((h) => {
              const pnl = (h.ltp - h.avg) * h.qty
              const pct = ((h.ltp - h.avg) / h.avg) * 100
              return (
                <TableRow key={h.symbol}>
                  <TableCell className="font-medium text-body text-ink">{h.symbol}</TableCell>
                  <TableCell className="text-right font-numeric text-number-sm">
                    {formatQuantity(h.qty)}
                  </TableCell>
                  <TableCell className="text-right font-numeric text-number-sm">
                    {formatCurrency(h.avg)}
                  </TableCell>
                  <TableCell className="text-right font-numeric text-number-sm">
                    {formatCurrency(h.ltp)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-numeric text-number-sm ${pnl < 0 ? 'text-down' : 'text-up'}`}
                  >
                    {formatSignedCurrency(pnl)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-numeric text-number-sm ${pct < 0 ? 'text-down' : 'text-up'}`}
                  >
                    {formatSignedPercent(pct)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <p className="mt-3 text-caption text-muted">
          The sign is rendered, not implied by colour — colour alone must never carry meaning.
        </p>
      </Section>

      <Section title="Skeleton">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <h2 className="text-title font-semibold text-ink">{title}</h2>
      {note ? <p className="mb-4 text-body-sm text-muted">{note}</p> : <div className="mb-4" />}
      {children}
    </section>
  )
}
