import { SupportForm } from './SupportForm'
import { ExternalLink } from './ExternalLink'
import { REPOSITORY_URL } from './nav-links'
import { Section } from './Section'

export function SupportContact() {
  return (
    <Section
      heading="Still stuck?"
      lede="Send a message and it lands in the database. This is a portfolio project rather than a product with a support desk, so a reply is not guaranteed — but the form is real."
    >
      <SupportForm />

      <p className="mt-8 max-w-prose text-body-sm text-body">
        If it is a bug, or a question about how something is implemented, the repository is a better
        place — it is where anyone would actually see it.{' '}
        <ExternalLink
          href={`${REPOSITORY_URL}/issues`}
          className="text-body underline underline-offset-4"
        >
          Open an issue on GitHub
        </ExternalLink>
      </p>
    </Section>
  )
}
