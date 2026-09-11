/**
 * A monogram for an account with no usable avatar.
 *
 * Shared rather than duplicated: `AvatarMenu` has rendered one since F17 and
 * `/settings` renders the same account, so two copies would be two answers to
 * "who is signed in" for one user.
 *
 * Takes at most the first two words, because a three-letter monogram does not
 * fit the 36px circle the nav uses. Returns `?` rather than an empty string for
 * a name that yields no letters — an empty circle reads as a failed render.
 */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')

  return letters.toUpperCase() || '?'
}
