import { DismissDisclaimerButton } from './DismissDisclaimerButton'

/**
 * The standing statement that nothing here is real. A Server Component: the
 * strip is static markup, and only its close button ships JavaScript.
 *
 * `data-slot="disclaimer-banner"` is the hook the globals.css rule hides off,
 * once the root layout's blocking script has stamped the dismissal on <html>.
 */
export function DisclaimerBanner() {
  return (
    <div
      data-slot="disclaimer-banner"
      className="border-b border-hairline bg-surface text-caption text-muted-strong"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 md:px-6">
        <p className="flex-1">
          <span className="font-medium text-ink">This is a paper-trading simulator.</span> No real
          money, no brokerage account, and no live order routing exist anywhere in this project. It
          is not affiliated with Zerodha.
        </p>
        <DismissDisclaimerButton />
      </div>
    </div>
  )
}
