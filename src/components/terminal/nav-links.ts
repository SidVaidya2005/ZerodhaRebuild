/**
 * The terminal navigation, declared once so the desktop nav and the mobile sheet
 * cannot drift — the same reason `marketing/nav-links.ts` exists.
 *
 * Every href here is a prefix in `TERMINAL_PREFIXES`, which `src/proxy.ts`
 * guards and `terminal-routes.test.ts` proves has a page behind it. A link added
 * here without a route fails that test rather than shipping a guarded 404.
 *
 * `/stocks` is absent deliberately: it has no index page, only
 * `stocks/[symbol]`, and is reached by searching or by clicking a symbol.
 */
export const TERMINAL_NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/orders', label: 'Orders' },
  { href: '/holdings', label: 'Holdings' },
  { href: '/positions', label: 'Positions' },
  { href: '/funds', label: 'Funds' },
  { href: '/reports', label: 'Reports' },
] as const
