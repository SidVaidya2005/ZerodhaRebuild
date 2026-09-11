import { describe, expect, it } from 'vitest'

import { initials } from './initials'

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Siddarth Vaidya')).toBe('SV')
  })

  it('stops at two, so a long name still fits the circle', () => {
    expect(initials('Jean Baptiste Emmanuel Zorg')).toBe('JB')
  })

  it('uppercases whatever it is given', () => {
    expect(initials('ada lovelace')).toBe('AL')
  })

  it('handles a single word', () => {
    expect(initials('Prince')).toBe('P')
  })

  it('collapses stray whitespace rather than reading it as a word', () => {
    expect(initials('  Grace   Hopper  ')).toBe('GH')
  })

  // An email is the third fallback in the terminal layout's name chain, so it
  // does reach here for a Google account with no display name set.
  it('falls back through an email address', () => {
    expect(initials('someone@example.com')).toBe('S')
  })

  // An empty circle reads as a broken render, not as a nameless account.
  it.each(['', '   ', '\t\n'])('returns ? for %j', (input) => {
    expect(initials(input)).toBe('?')
  })
})
