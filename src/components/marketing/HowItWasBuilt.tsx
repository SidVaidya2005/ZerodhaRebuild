import { REPOSITORY_URL } from './nav-links'
import { ExternalLink } from './ExternalLink'
import { Section } from './Section'

type Path = {
  title: string
  lede: string
  steps: readonly string[]
}

/**
 * Prose and two ordered paths rather than a diagram. The diagrams in the
 * architecture notes are ASCII, which needs a horizontal scroller, reads badly
 * at 375px, and gives a screen reader a wall of box-drawing characters. What a
 * technical reader wants from this section is the invariants, and those are
 * prose either way.
 */
const PATHS: readonly Path[] = [
  {
    title: 'How a price reaches the screen',
    lede: 'There is no always-on worker anywhere in this system — the free hosting tier does not have one.',
    steps: [
      'A scheduled Postgres job wakes once a minute during market hours and calls an Edge Function.',
      'That function checks the real NSE session clock against a holiday calendar before it does anything. The schedule window is a cost bound, never the authority.',
      'It fetches only the symbols someone is actually looking at, holding, or has an open order against, through a rate limiter.',
      'Providers are tried in order and fall through on failure — a dead provider trips a circuit breaker and the next one takes over, ending at a simulator that always answers.',
      'Quotes are written with the provider that produced them and that provider\u2019s own timestamp, and the row change is pushed to subscribed browsers.',
      'The browser interpolates between refreshes so the tape moves. Those in-between figures are synthetic and are never used where a number drives a decision.',
    ],
  },
  {
    title: 'What happens when you place an order',
    lede: 'The entire fill is one database transaction, because a half-applied trade is worse than a rejected one.',
    steps: [
      'A Server Action validates the input and calls a Postgres function. Nothing about the order is decided in TypeScript.',
      'The order row is written and its margin requirement is reserved out of available cash immediately.',
      'The fill locks the order row, then re-checks that it is still open — the lock alone does not prevent a concurrent run filling it twice.',
      'It locks the funds row before reading the balance, so two orders cannot both pass the same affordability check.',
      'Charges are computed, the trade is recorded, the holding or position is updated, cash moves, and a ledger row is appended — all or nothing.',
      'An order you cannot afford is rejected with a reason and the reservation is released. The funds row is left exactly as it was.',
    ],
  },
]

const INVARIANTS: readonly string[] = [
  'No money value is ever calculated in TypeScript and stored. Balances, average prices, charges and realised P&L are computed in Postgres and read back; TypeScript only formats them.',
  'Fills happen in exactly one place — a single database function. Not in a Server Action, not in a route handler, not in the scheduled job.',
  'Row Level Security is the security boundary, not application code. Every table holding user data is scoped to the signed-in user in the database itself, so a bug in a page cannot leak another account.',
  'A price never claims to be fresher than it is. Provenance is derived when a price is rendered, never stored as a flag that could go stale.',
]

export function HowItWasBuilt() {
  return (
    <Section
      heading="How it was built"
      lede="A Next.js app in front of Postgres, where all the interesting rules live in the database rather than in the application."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {PATHS.map((path) => (
          <div key={path.title} className="rounded-xl border border-hairline bg-surface p-6">
            <h3 className="text-title-sm font-semibold text-ink">{path.title}</h3>
            <p className="mt-2 text-body-sm text-muted-strong">{path.lede}</p>
            <ol className="mt-4 flex flex-col gap-3">
              {path.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-body-sm text-body">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 font-numeric text-caption font-medium text-brand"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <h3 className="mt-10 text-title-sm font-semibold text-ink">Rules the code will not break</h3>
      <ul className="mt-4 flex max-w-prose flex-col gap-3">
        {INVARIANTS.map((invariant) => (
          <li key={invariant} className="flex gap-2 text-body-sm text-body">
            <span aria-hidden="true" className="text-brand">
              &middot;
            </span>
            <span>{invariant}</span>
          </li>
        ))}
      </ul>

      <p className="mt-8 max-w-prose text-body-sm text-body">
        The source, including the architecture notes and the trading contract these rules come from,
        is on{' '}
        <ExternalLink href={REPOSITORY_URL} className="text-brand underline underline-offset-4">
          GitHub
        </ExternalLink>
        .
      </p>
    </Section>
  )
}
