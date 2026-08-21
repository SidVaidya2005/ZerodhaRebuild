/**
 * The public navigation, declared once. `SiteHeader` and `MobileNav` both read
 * this list so the desktop nav and the mobile sheet cannot drift apart.
 */
export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/support', label: 'Support' },
] as const

/** Where every sign-in call to action in the public site points. */
export const SIGN_IN_HREF = '/auth/login'

export const REPOSITORY_URL = 'https://github.com/SidVaidya2005/ZerodhaRebuild'
