/**
 * The stack table rendered on /about, mirroring `architecture.md` → Stack.
 *
 * Versions live here rather than being read from `package.json` at render time,
 * so the page stays a plain static render and does not bundle the manifest.
 * `stack.test.ts` is what keeps the two honest, in both directions: an
 * `installed` row must match the manifest, and a `planned` row must be absent
 * from it. Upgrading a dependency without touching this file fails the suite,
 * and so does installing a planned package without flipping its status.
 */

export type StackStatus =
  /** Present in package.json today. `version` must match it exactly. */
  | 'installed'
  /** architecture.md commits to it; a later phase installs it. */
  | 'planned'
  /** Not an npm package at all — a hosted service, a Postgres extension, an upstream API. */
  | 'external'

export type StackEntry = {
  layer: string
  /** npm package name. Null for `external` rows. */
  pkg: string | null
  /** Exact pinned version. Null unless the row is `installed`. */
  version: string | null
  status: StackStatus
  purpose: string
}

export const STACK: readonly StackEntry[] = [
  {
    layer: 'Framework',
    pkg: 'next',
    version: '16.3.1',
    status: 'installed',
    purpose: 'App Router. Marketing pages, terminal routes, Server Actions, route handlers.',
  },
  {
    layer: 'UI runtime',
    pkg: 'react',
    version: '19.2.8',
    status: 'installed',
    purpose: 'Server Components by default; Client Components only for live price surfaces.',
  },
  {
    layer: 'Language',
    pkg: 'typescript',
    version: '6.0.3',
    status: 'installed',
    purpose:
      'Strict mode everywhere. Held below 7.x because typescript-eslint cannot load against the TS 7 API.',
  },
  {
    layer: 'Styling',
    pkg: 'tailwindcss',
    version: '4.3.3',
    status: 'installed',
    purpose: 'CSS-first theming through @theme; every token derives from the design system.',
  },
  {
    layer: 'Type',
    pkg: null,
    version: null,
    status: 'external',
    purpose:
      'Inter and IBM Plex Sans through next/font. Editorial text in one, every number in the other, with tabular figures so columns line up.',
  },
  {
    layer: 'Components',
    pkg: 'radix-ui',
    version: '1.6.7',
    status: 'installed',
    purpose:
      'shadcn/ui primitives, restyled to this system. Dialogs, tabs, sheets, command palette.',
  },
  {
    layer: 'Icons',
    pkg: 'lucide-react',
    version: '1.33.0',
    status: 'installed',
    purpose: 'The single icon set.',
  },
  {
    layer: 'Validation',
    pkg: 'zod',
    version: '4.4.3',
    status: 'installed',
    purpose: 'Every Server Action input and every external API response is parsed before use.',
  },
  {
    layer: 'Theming',
    pkg: 'next-themes',
    version: '0.4.6',
    status: 'installed',
    purpose: 'Light and dark from one token set, persisted without a flash on load.',
  },
  {
    layer: 'Database',
    pkg: null,
    version: null,
    status: 'external',
    purpose:
      'Supabase Postgres, hosted. All persistent state, and the source of truth for every money calculation.',
  },
  {
    layer: 'Auth',
    pkg: '@supabase/ssr',
    version: '0.12.4',
    status: 'installed',
    purpose:
      'Google OAuth through Supabase Auth; session cookies and route protection in proxy.ts.',
  },
  {
    layer: 'Client SDK',
    pkg: '@supabase/supabase-js',
    version: '2.112.3',
    status: 'installed',
    purpose: 'Browser, server and service-role clients.',
  },
  {
    layer: 'Realtime',
    pkg: null,
    version: null,
    status: 'external',
    purpose: 'Supabase Realtime pushes quote and order row changes to subscribed browsers.',
  },
  {
    layer: 'Scheduled work',
    pkg: null,
    version: null,
    status: 'external',
    purpose:
      'Postgres pg_cron and pg_net calling a Deno Edge Function: quote refresh, limit matching, intraday square-off.',
  },
  {
    layer: 'Client tick state',
    pkg: 'zustand',
    version: '5.0.15',
    status: 'installed',
    purpose: 'In-memory live quote store and the tick interpolation loop.',
  },
  {
    layer: 'Forms',
    pkg: 'react-hook-form',
    version: '7.85.0',
    status: 'installed',
    // Not the support form: that uses React 19's form action and
    // `useActionState`, so it submits and validates without JavaScript (F07B).
    purpose: 'The order ticket.',
  },
  {
    layer: 'Portfolio charts',
    pkg: 'recharts',
    version: '3.10.1',
    status: 'installed',
    purpose: 'Top-ten holdings donut and P&L breakdown.',
  },
  {
    layer: 'Price charts',
    pkg: 'lightweight-charts',
    version: null,
    status: 'planned',
    purpose: 'Candlestick chart on the stock detail page.',
  },
  {
    layer: 'Quote sources',
    pkg: null,
    version: null,
    status: 'external',
    purpose:
      'Yahoo Finance, then an optional keyed provider, then a built-in simulator. Each quote carries which one produced it.',
  },
  {
    layer: 'Tests — logic',
    pkg: 'vitest',
    version: '4.1.11',
    status: 'installed',
    purpose: 'Charge estimator, provider chain, market hours, parsers. No database.',
  },
  {
    layer: 'Tests — database',
    pkg: null,
    version: null,
    status: 'external',
    purpose:
      'pgTAP assertions over RLS, grants, constraints and function results, run by a small in-repo runner because the Supabase CLI needs Docker.',
  },
  {
    layer: 'Tests — concurrency',
    pkg: 'pg',
    version: '8.23.0',
    status: 'installed',
    purpose:
      'Two live connections racing for a row lock — the thing neither other tier can express.',
  },
  {
    layer: 'Accessibility',
    pkg: 'lighthouse',
    version: '13.4.1',
    status: 'installed',
    purpose: 'Every public page is audited as it ships, not once at the end.',
  },
  {
    layer: 'Tooling',
    pkg: 'eslint',
    version: '9.39.5',
    status: 'installed',
    purpose: 'Linting. Held below 10 because eslint-plugin-react crashes on its rule-context API.',
  },
  {
    layer: 'Formatting',
    pkg: 'prettier',
    version: '3.9.6',
    status: 'installed',
    purpose: 'Formatting, with automatic Tailwind class ordering.',
  },
  {
    layer: 'Hosting',
    pkg: null,
    version: null,
    status: 'external',
    purpose: 'Render free web service in front of hosted Supabase.',
  },
]
