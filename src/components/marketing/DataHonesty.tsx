import { Section } from './Section'

type BadgeState = {
  label: string
  meaning: string
  /** Whether this build can ever put the badge into this state. */
  reachable: boolean
}

/**
 * The four states deriveSource() can return, documented honestly.
 *
 * LIVE is included and explicitly marked unreachable rather than quietly
 * omitted: architecture.md reserves it for a genuinely streaming provider and
 * PROVIDER_IS_REALTIME is false for all three of this build's providers, so a
 * quote here can only badge DELAYED, SIMULATED or STALE. Saying that plainly is
 * the point of the badge — a LIVE chip over a polled REST endpoint would be the
 * exact overclaim the whole provenance system exists to prevent.
 *
 * These chips are presentational marketing copy, not the real badge. The real
 * one is built in feature 20 against Provenance and deriveSource().
 *
 * Toned with brand, info and muted only. The trading green and red carry a fixed
 * price-direction meaning and DESIGN.md forbids reusing them for anything else —
 * a provenance state is not a price direction.
 */
const BADGE_STATES: readonly BadgeState[] = [
  {
    label: 'DELAYED',
    meaning:
      'A real provider produced this price, recently enough to trade against, but it was polled rather than streamed. This is what you will see during market hours.',
    reachable: true,
  },
  {
    label: 'SIMULATED',
    meaning:
      'No provider could be reached, so a tick engine produced this figure from the last known real price. It is a plausible number, not a real one, and it never pretends otherwise.',
    reachable: true,
  },
  {
    label: 'STALE',
    meaning:
      'The most recent price is too old to act on — outside market hours, or after a provider outage. Orders will not fill against it.',
    reachable: true,
  },
  {
    label: 'LIVE',
    meaning:
      'Reserved for a provider that genuinely streams ticks. This build does not have one, so you will never see this badge here. It exists so the vocabulary stays honest rather than convenient.',
    reachable: false,
  },
]

export function DataHonesty() {
  return (
    <Section
      heading="Where the prices come from"
      lede="Every price on screen carries its own provenance, derived when it is rendered rather than stored as a flag. Here is the whole vocabulary."
    >
      <dl className="flex flex-col gap-4">
        {BADGE_STATES.map((state) => (
          <div
            key={state.label}
            className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface p-5 sm:flex-row sm:gap-6"
          >
            <dt className="sm:w-40 sm:shrink-0">
              <span
                className={
                  state.reachable
                    ? 'inline-flex items-center rounded-sm border border-info/40 bg-info/10 px-2 py-1 font-numeric text-caption font-medium text-body'
                    : 'inline-flex items-center rounded-sm border border-hairline px-2 py-1 font-numeric text-caption font-medium text-muted line-through'
                }
              >
                {state.label}
              </span>
              {state.reachable ? null : (
                <span className="mt-1 block text-caption text-muted">never shown here</span>
              )}
            </dt>
            <dd className="text-body-sm text-body">{state.meaning}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 max-w-prose text-body-sm text-body">
        Prices also move between refreshes so the tape does not sit still, and those in-between
        figures are interpolated rather than fetched. Anywhere a number actually drives a decision —
        the order ticket, a confirmation, any total — you get the real fetched value, never the
        animated one.
      </p>
    </Section>
  )
}
