import { STACK } from '@/lib/stack'

import { Section } from './Section'

/**
 * Rows are rendered from src/lib/stack.ts, which stack.test.ts pins to
 * package.json in both directions. A version shown here is a version actually
 * installed; a row marked "planned" is a package this build has genuinely not
 * installed yet, rather than one quietly given an invented number.
 */
export function StackTable() {
  return (
    <Section
      heading="The stack"
      lede="Every dependency is pinned exactly. The versions below are checked against package.json by a test, so they cannot drift out of date without the suite failing."
    >
      {/* A scrollable region has to be reachable by keyboard, or a keyboard-only
          user simply cannot see the columns that overflow — at 375px that is
          most of them. tabIndex plus a labelled role is the standard treatment;
          Lighthouse does not audit this, axe does. */}
      <div
        role="region"
        aria-label="Technology stack"
        tabIndex={0}
        className="overflow-x-auto rounded-xl border border-hairline focus-visible:ring-2 focus-visible:ring-info/50 focus-visible:outline-none"
      >
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <caption className="sr-only">
            Technology stack by layer, with pinned versions where a package is installed.
          </caption>
          <thead>
            <tr className="border-b border-hairline bg-surface">
              <th scope="col" className="px-4 py-3 text-caption font-medium text-muted-strong">
                Layer
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-medium text-muted-strong">
                Package
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-medium text-muted-strong">
                Version
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-medium text-muted-strong">
                What it does here
              </th>
            </tr>
          </thead>
          <tbody>
            {STACK.map((entry) => (
              <tr key={entry.layer} className="border-b border-hairline last:border-b-0">
                <th
                  scope="row"
                  className="px-4 py-3 align-top text-body-sm font-medium whitespace-nowrap text-ink"
                >
                  {entry.layer}
                </th>
                <td className="px-4 py-3 align-top font-numeric text-body-sm whitespace-nowrap text-body">
                  {entry.pkg ?? <span className="text-muted-strong">&mdash;</span>}
                </td>
                <td className="px-4 py-3 align-top font-numeric text-body-sm whitespace-nowrap">
                  {entry.version ? (
                    <span className="text-body">{entry.version}</span>
                  ) : entry.status === 'planned' ? (
                    <span className="rounded-sm border border-hairline px-1.5 py-0.5 text-caption text-muted-strong">
                      planned
                    </span>
                  ) : (
                    <span className="text-muted-strong">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-body-sm text-body">{entry.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-prose text-body-sm text-body">
        Rows marked <span className="font-medium">planned</span> are committed to in the
        architecture but installed by a later phase. They carry no version because there is nothing
        installed to version.
      </p>
    </Section>
  )
}
