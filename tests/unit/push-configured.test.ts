import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPushConfigured } from '@/lib/firebase/config'

// The dashboard shows the notifications button only when push can actually work.

const full = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'key',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'proj',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123:web:abc',
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: 'vapid',
}
const setup = (env: Record<string, string>) => {
  for (const name of [...Object.keys(full), 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET']) vi.stubEnv(name, '')
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
}

afterEach(() => vi.unstubAllEnvs())

describe('isPushConfigured', () => {
  it('is false on a fresh checkout with no Firebase settings, without throwing', () => {
    setup({})
    expect(isPushConfigured()).toBe(false)
  })

  it('is true with the web config and a web push key (auth domain and bucket are optional)', () => {
    setup(full)
    expect(isPushConfigured()).toBe(true)
  })

  it('is false when any required setting is missing', () => {
    for (const missing of ['NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID']) {
      setup({ ...full, [missing]: '' })
      expect(isPushConfigured(), missing).toBe(false)
    }
  })

  it('is false without the web push key, because the token request needs it', () => {
    setup({ ...full, NEXT_PUBLIC_FIREBASE_VAPID_KEY: '' })
    expect(isPushConfigured()).toBe(false)
  })

  it('treats blank (whitespace) values as missing', () => {
    setup({ ...full, NEXT_PUBLIC_FIREBASE_API_KEY: '   ' })
    expect(isPushConfigured()).toBe(false)
  })
})
