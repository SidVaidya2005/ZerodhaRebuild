import { describe, expect, it } from 'vitest'

import { isTheme, THEMES, themeSchema } from './theme'

describe('themeSchema', () => {
  it('accepts exactly the two values the CHECK allows', () => {
    expect(THEMES).toEqual(['light', 'dark'])
    expect(themeSchema.parse('light')).toBe('light')
    expect(themeSchema.parse('dark')).toBe('dark')
  })

  // next-themes would report 'system' if enableSystem were ever turned on, and
  // profiles.theme cannot store it. Failing here is cheaper than a 23514.
  it.each(['system', 'blue', 'Dark', '', 'light '])('rejects %j', (input) => {
    expect(themeSchema.safeParse(input).success).toBe(false)
  })

  it('rejects a non-string', () => {
    expect(themeSchema.safeParse(null).success).toBe(false)
    expect(themeSchema.safeParse(undefined).success).toBe(false)
    expect(themeSchema.safeParse({ theme: 'dark' }).success).toBe(false)
  })
})

describe('isTheme', () => {
  it('narrows the hook value, which is string | undefined', () => {
    expect(isTheme('dark')).toBe(true)
    expect(isTheme(undefined)).toBe(false)
    expect(isTheme('system')).toBe(false)
  })
})
