import { REPOSITORY_URL } from './nav-links'
import { ExternalLink } from './ExternalLink'
import { Section } from './Section'

/**
 * Slice A ships no contact form. The form, its `support_messages` migration and
 * the RLS policy behind it need a database layer this project does not have yet
 * — see `build-plan.md` feature 07, Slice B.
 *
 * A disabled "coming soon" form would be a worse experience than none, and this
 * way Slice B adds the form rather than replacing a placeholder.
 */
export function SupportContact() {
  return (
    <Section heading="Still stuck?">
      <div className="max-w-prose">
        <p className="text-body">
          This is a portfolio project rather than a product with a support desk, so the honest
          answer is that the fastest way to reach anyone is the repository. Bug reports, questions
          about how something is implemented, and arguments about whether the charge model is right
          are all welcome there.
        </p>
        <p className="mt-4 text-body-sm text-body">
          <ExternalLink
            href={`${REPOSITORY_URL}/issues`}
            className="text-body underline underline-offset-4"
          >
            Open an issue on GitHub
          </ExternalLink>
        </p>
        <p className="mt-6 text-body-sm text-muted-strong">
          A contact form that writes to the database is planned; it is waiting on the database layer
          rather than on the form.
        </p>
      </div>
    </Section>
  )
}
