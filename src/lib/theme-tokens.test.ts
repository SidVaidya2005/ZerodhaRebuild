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

  const mustFlip = ['--color-canvas', '--color-surface', '--color-hairline', '--color-ink']

  it.each(mustFlip)('does redefine %s', (token) => {
    expect(lightBlock).toContain(`${token}:`)
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
