import { Section } from './Section'

type Simplification = {
  title: string
  reality: string
  here: string
  why: string
}

/**
 * Every place the simulator knowingly behaves differently from a real broker.
 *
 * Each entry states what a real broker does, what this does instead, and why —
 * the "why" matters, because a divergence with a stated reason is a design
 * decision and one without is a bug nobody has noticed yet. `/about` carries the
 * inventory of what is real and what is simulated; this is the narrower list of
 * places the faithful-looking parts are not quite faithful.
 */
const SIMPLIFICATIONS: readonly Simplification[] = [
  {
    title: 'A losing short cannot bankrupt you',
    reality:
      'If a short position moves against you far enough, a real broker issues a margin call and pursues you for the balance. Your account can go negative.',
    here: 'The cash debit is capped, the balance floors at zero, and the uncovered remainder is recorded as an explicit adjustment in the ledger. The trade still records the true, uncapped loss, so the reports stay honest.',
    why: 'A simulator holding no real money has nobody to pursue. Capping it keeps the ledger arithmetic sound — the balance still equals the sum of the ledger — and the adjustment row makes the divergence auditable instead of hiding it.',
  },
  {
    title: 'Prices are delayed, not live',
    reality: 'A real terminal streams ticks from the exchange as they happen.',
    here: 'Prices are polled on a schedule and animated in between, and the badge on every price says so. No provider used here streams, so nothing is ever labelled live.',
    why: 'Streaming market data is licensed and expensive. Saying delayed accurately is better than saying live inaccurately.',
  },
  {
    title: 'There is nobody on the other side',
    reality:
      'Your order meets a real order book. It can fill partially, it can fill at several prices, and a large order moves the market against you.',
    here: 'An order fills completely at the last traded price or not at all. Partial fills do not exist, and your orders move nothing.',
    why: 'Simulating a counterparty book convincingly is a much larger project than this one, and a badly simulated one would teach worse habits than an obviously absent one.',
  },
  {
    title: 'Shares are sellable immediately',
    reality:
      'Delivery settles over a day or more, and the shares are not fully yours to sell until it completes.',
    here: 'A delivery buy lands in your holdings straight away and can be sold in the next moment.',
    why: 'Settlement mechanics would add a waiting period that teaches nothing about how orders, margin and charges work, which is what this is for.',
  },
  {
    title: 'The DP charge is applied per sell order',
    reality:
      'A real broker charges the depository fee once per stock per day, however many times you sell that stock.',
    here: 'It is charged once per sell order, so selling the same stock twice in a day costs it twice.',
    why: 'Matching reality means checking your earlier trades in that stock today from inside the locked transaction that fills the order, and giving the account reset another case to handle. The cost of that complexity outweighed the accuracy for an uncommon case — but it is a real divergence, so it is listed here rather than quietly absorbed.',
  },
  {
    title: 'Only two products and two order types',
    reality:
      'A real terminal offers stop-loss, cover and bracket orders, good-till-triggered orders, after-market orders, futures and options.',
    here: 'Market and limit orders, in delivery and intraday, on around two hundred stocks. Nothing else.',
    why: 'These are the ones that teach the mechanics. The rest are variations on top of machinery you have to understand first.',
  },
]

export function SimulationSimplifications() {
  return (
    <Section
      heading="Where this differs from a real broker"
      lede="The mechanics are modelled closely, but not everywhere. These are the places the simulator knowingly behaves differently, and why."
    >
      <div id="simplifications" className="flex flex-col gap-6">
        {SIMPLIFICATIONS.map((item) => (
          <article key={item.title} className="rounded-xl border border-hairline bg-surface p-6">
            <h3 className="text-title-sm font-semibold text-ink">{item.title}</h3>
            <dl className="mt-4 flex flex-col gap-3">
              <Line label="A real broker" value={item.reality} />
              <Line label="Here" value={item.here} />
              <Line label="Why" value={item.why} />
            </dl>
          </article>
        ))}
      </div>
    </Section>
  )
}

type LineProps = {
  label: string
  value: string
}

function Line({ label, value }: LineProps) {
  return (
    <div className="sm:flex sm:gap-4">
      <dt className="text-caption font-medium text-muted-strong sm:w-28 sm:shrink-0">{label}</dt>
      <dd className="text-body-sm text-body">{value}</dd>
    </div>
  )
}
