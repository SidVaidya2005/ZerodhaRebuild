import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The categorical ramp's two accessibility properties, asserted rather than
 * eyeballed.
 *
 * The ramp F21 replaced was written by hand with a TODO to check it "before the
 * dashboard ships". It failed when finally measured: `#3b82f6` and `#8b5cf6`
 * sat 0.8 apart under a deuteranopia simulation, which is to say a deuteranope
 * saw two identical arcs. A TODO cannot fail a build; this can.
 */

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

const RAMP = Array.from({ length: 10 }, (_, i) => {
  const match = css.match(new RegExp(`--color-chart-${i + 1}:\\s*(#[0-9a-f]{6})`, 'i'))
  expect(match, `--color-chart-${i + 1} is missing from globals.css`).not.toBeNull()
  return (match?.[1] ?? '#000000').toLowerCase()
})

/** `--color-surface` in each theme: the card a donut arc is actually drawn on. */
const SURFACE = { dark: '#1e2329', light: '#fafafa' }

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const linearise = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = channels(hex).map(linearise)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Brettel/Viénot deuteranopia simulation, in linear RGB. */
function deuteranope(hex: string): number[] {
  const [r = 0, g = 0, b = 0] = channels(hex).map(linearise)
  const l = 0.31399 * r + 0.63951 * g + 0.04649 * b
  const s = 0.01776 * r + 0.10945 * g + 0.87247 * b
  // The M cone response is never computed, and that is the whole point: a
  // deuteranope has no working M cone, so the simulation *replaces* it with a
  // value projected from L and S rather than attenuating the real one.
  const m2 = 0.494207 * l + 1.24827 * s
  return [
    5.47221 * l - 4.64196 * m2 + 0.16963 * s,
    -1.12524 * l + 2.29317 * m2 - 0.16789 * s,
    0.0298 * l - 0.19318 * m2 + 1.16364 * s,
  ].map((v) => Math.max(0, Math.min(1, v)))
}

const distance = (a: number[], b: number[]) =>
  Math.hypot(...a.map((v, i) => (v - (b[i] ?? 0)) * 100))

const normalSeparation = (a: string, b: string) =>
  distance(channels(a).map(linearise), channels(b).map(linearise))

const deuteranopeSeparation = (a: string, b: string) => distance(deuteranope(a), deuteranope(b))

describe('the chart categorical ramp', () => {
  it('has ten colours', () => {
    expect(RAMP).toHaveLength(10)
    expect(new Set(RAMP).size).toBe(10)
  })

  // The binding requirement is against the *card*, not the page. WCAG 1.4.11's
  // 3:1 covers graphics required to understand the content, and the donut ships
  // beside a table carrying every value — so what must hold is only that no arc
  // dissolves into the surface it is drawn on, in either theme.
  it.each(RAMP)('%s stays visible against the card in both themes', (colour) => {
    expect(contrast(colour, SURFACE.dark)).toBeGreaterThanOrEqual(1.7)
    expect(contrast(colour, SURFACE.light)).toBeGreaterThanOrEqual(1.7)
  })

  it('separates every pair under normal vision and under deuteranopia', () => {
    const failures: string[] = []

    for (let i = 0; i < RAMP.length; i++) {
      for (let j = i + 1; j < RAMP.length; j++) {
        const [a, b] = [RAMP[i]!, RAMP[j]!]
        const worst = Math.min(normalSeparation(a, b), deuteranopeSeparation(a, b))
        if (worst < 15) {
          failures.push(
            `chart-${i + 1} ${a} / chart-${j + 1} ${b}: ${worst.toFixed(1)} ` +
              `(normal ${normalSeparation(a, b).toFixed(1)}, deuteranope ${deuteranopeSeparation(a, b).toFixed(1)})`
          )
        }
      }
    }

    expect(failures, `ramp colours too close to tell apart:\n  ${failures.join('\n  ')}`).toEqual(
      []
    )
  })

  it('holds no green or red, which mean "up" and "down" everywhere else', () => {
    for (const colour of RAMP) {
      const [r = 0, g = 0, b = 0] = channels(colour)
      // A green slice reads as a rising position and a red one as a falling
      // position, whatever the exact hex — so the whole family is excluded, not
      // just the two trading tokens.
      const dominantGreen = g > r + 0.12 && g > b + 0.12
      const dominantRed = r > g + 0.3 && r > b + 0.3
      expect(dominantGreen, `${colour} reads as a green slice`).toBe(false)
      expect(dominantRed, `${colour} reads as a red slice`).toBe(false)
    }
  })
})
