/**
 * What every terminal route renders until its own feature builds it.
 *
 * The same call F03 made for the public site: stub every destination the nav
 * points at, so navigation never 404s and each later feature replaces one page
 * wholesale rather than also inventing where it lives. Naming the feature that
 * replaces it keeps the stub from being mistaken for something unfinished by
 * accident rather than by plan.
 */

type TerminalPlaceholderProps = {
  title: string
  /** The feature number that replaces this page, e.g. `F27`. */
  arrivesIn: string
  description: string
}

export function TerminalPlaceholder({ title, arrivesIn, description }: TerminalPlaceholderProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <h1 className="text-title font-semibold text-ink">{title}</h1>
      <p className="mt-3 max-w-prose text-body text-muted-strong">{description}</p>
      <p className="mt-6 text-body-sm text-muted">Arrives in {arrivesIn}.</p>
    </div>
  )
}
