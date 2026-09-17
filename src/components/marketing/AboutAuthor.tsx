import { AUTHOR_NAME, AuthorLinks } from './AuthorLinks'
import { Section } from './Section'

export function AboutAuthor() {
  return (
    <Section
      heading="Who built it"
      lede={`Designed and built by ${AUTHOR_NAME}. Get in touch, or see more work.`}
    >
      {/* -ml-2 aligns the first icon's glyph, not its 36px hit area, with the heading. */}
      <AuthorLinks className="-mt-4 -ml-2" />
    </Section>
  )
}
