import { describe, expect, it } from 'vitest'

import { parseServerEnv } from '@/lib/env.server'
import { parsePublicEnv } from '@/lib/env'

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefgh.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
}

describe('parsePublicEnv', () => {
  it('accepts a complete set', () => {
    expect(parsePublicEnv(validPublic)).toEqual(validPublic)
  })

  it('names the missing variable rather than failing as undefined later', () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _omitted, ...incomplete } = validPublic
    expect(() => parsePublicEnv(incomplete)).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('rejects a value that is not a URL', () => {
    expect(() =>
      parsePublicEnv({ ...validPublic, NEXT_PUBLIC_SITE_URL: 'localhost:3000' })
    ).toThrowError(/NEXT_PUBLIC_SITE_URL/)
  })
})

describe('parseServerEnv', () => {
  it('names the missing service-role key', () => {
    expect(() => parseServerEnv({})).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('treats an empty optional as unset, so the provider chain skips it', () => {
    const parsed = parseServerEnv({
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc123',
      TWELVE_DATA_API_KEY: '',
      TEST_DATABASE_URL: '',
    })
    expect(parsed.TWELVE_DATA_API_KEY).toBeUndefined()
    expect(parsed.TEST_DATABASE_URL).toBeUndefined()
  })
})
