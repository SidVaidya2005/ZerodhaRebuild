import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * These assertions exist because "brand yellow is identical in both themes" is
 * otherwise checked by eye, and an eye does not run in CI. The stylesheet is the
 * artifact that decides it, so the stylesheet is what gets parsed.
 */
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

function block(selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `${selector} block is missing from globals.css`).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  const close = css.indexOf('\n}', open)
  return css.slice(open, close)
}

const lightBlock = block('.light {')
const baseTheme = block('@theme {')
const bridge = block('@theme inline {')

describe('the .light override block', () => {
  // DESIGN.md: only canvas, surface and text tones flip between modes.
  const mustNotFlip = [
    '--color-brand',
    '--color-brand-active',
    '--color-brand-disabled',
    '--color-on-brand',
    '--color-up',
    '--color-down',
  ]

  it.each(mustNotFlip)('does not redefine %s', (token) => {
    expect(lightBlock).not.toContain(`${token}:`)
  })

  const mustFlip = [
    '--color-canvas',
    '--color-surface',
    '--color-hairline',
    '--color-ink',
    // The trading *text* tier flips even though the fills above it never do.
    // Left at the fill values, green measured 1.95:1 and red 3.24:1 on the light
    // surfaces — every P&L figure in the light terminal was below AA. Found by
    // axe at F38, because nothing here was computing their ratios: they appeared
    // only in `mustNotFlip` above, which says nothing about contrast.
    '--color-up-text',
    '--color-down-text',
    // The muted tones flip too. Left at their dark values they failed WCAG AA on
    // the light canvas and inverted their own hierarchy — muted-strong, being the
    // lighter of the two, read as less prominent than muted. See the contrast
    // suite below, which is what actually enforces this.
    '--color-muted',
    '--color-muted-strong',
  ]

  it.each(mustFlip)('does redefine %s', (token) => {
    expect(lightBlock).toContain(`${token}:`)
  })
})

/**
 * Contrast is the one thing about a palette that is objectively checkable, and
 * it was the one thing nobody was checking: `pnpm audit:a11y` only ever loads
 * the default dark theme, so every light-mode failure was invisible to it.
 *
 * These parse the stylesheet and compute the ratios, so a token cannot be
 * darkened or lightened past AA without the suite going red.
 */
function readToken(source: string, token: string): string {
  const match = source.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i'))
  expect(match, `${token} is not defined as a hex literal`).not.toBeNull()
  return (match as RegExpMatchArray)[1] as string
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG AA for normal-sized text. */
const AA = 4.5

const THEMES = [
  {
    name: 'dark',
    source: baseTheme,
    surfaces: ['--color-canvas', '--color-surface', '--color-surface-elevated'],
  },
  {
    name: 'light',
    // The light block only redefines some tokens; anything absent inherits the base.
    source: lightBlock + baseTheme,
    surfaces: ['--color-canvas', '--color-surface', '--color-surface-elevated'],
  },
] as const

describe.each(THEMES)('$name theme contrast', ({ source, surfaces }) => {
  // Every token this project renders as *text*. The trading pair earns its place
  // here the hard way: `--color-up`/`--color-down` were used as text app-wide and
  // were never in this list, so nothing computed their ratios — axe found green
  // at 1.95:1 on the light canvas at F38. The `-text` tier exists so this list
  // can cover them without flipping the fills, which F02 pins byte-identical.
  const foregrounds = [
    '--color-ink',
    '--color-body',
    '--color-muted',
    '--color-muted-strong',
    '--color-up-text',
    '--color-down-text',
  ]

  it.each(foregrounds)('%s clears AA on every surface', (token) => {
    const colour = readToken(source, token)
    for (const surface of surfaces) {
      const background = readToken(source, surface)
      const ratio = contrastRatio(colour, background)
      expect(
        ratio,
        `${token} (${colour}) on ${surface} (${background}) is ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(AA)
    }
  })

  it('keeps muted dimmer than muted-strong, which stays dimmer than body', () => {
    // The worst surface decides it — a hierarchy that only holds on the page
    // background is not a hierarchy.
    const worst = (token: string) =>
      Math.min(
        ...surfaces.map((surface) =>
          contrastRatio(readToken(source, token), readToken(source, surface))
        )
      )
    expect(worst('--color-muted')).toBeLessThan(worst('--color-muted-strong'))
    expect(worst('--color-muted-strong')).toBeLessThan(worst('--color-body'))
  })
})

describe('the shadcn bridge block', () => {
  it('leaves --color-muted to this project, which means the text grey by it', () => {
    // shadcn means a *surface* by --color-muted. Defining it here would silently
    // turn every `text-muted` caption into a surface colour.
    expect(bridge).not.toContain('--color-muted:')
  })

  it('still resolves text-muted-foreground for shadcn components', () => {
    expect(bridge).toContain('--color-muted-foreground: var(--color-muted)')
  })

  it('points shadcn colours at this project tokens, never at raw hex', () => {
    const declarations = bridge.match(/--color-[a-z-]+:\s*([^;]+);/g) ?? []
    expect(declarations.length).toBeGreaterThan(10)
    for (const declaration of declarations) {
      expect(declaration).toMatch(/var\(--color-[a-z-]+\)/)
    }
  })
})

describe('theme variants', () => {
  it('defines a light variant, because dark is the base', () => {
    expect(css).toContain('@custom-variant light')
  })

  it('neutralises the built-in dark variant so a stray dark: class cannot follow the OS', () => {
    expect(css).toMatch(/@custom-variant dark \(&:where\(\.__no-dark-variant/)
  })
})

describe('the base @theme block', () => {
  it('carries the full ten-colour chart ramp', () => {
    for (let i = 1; i <= 10; i += 1) {
      expect(baseTheme).toContain(`--color-chart-${i}:`)
    }
  })

  it('excludes the trading colours from that ramp', () => {
    const ramp = (baseTheme.match(/--color-chart-\d+:\s*(#[0-9a-f]{6})/g) ?? []).map((d) =>
      d.split(':')[1]?.trim()
    )
    expect(ramp).not.toContain('#0ecb81')
    expect(ramp).not.toContain('#f6465d')
  })
})
