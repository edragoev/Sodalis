import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPushConfigured, isValidVapidKey } from '@/lib/firebase/config'

// The dashboard shows the notifications button only when push can actually work.

const full = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'key',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'proj',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123:web:abc',
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: 'B' + 'x'.repeat(86), // a real web push key is 87 characters
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

  it('is false when the web push key is the wrong length (a character missing or extra)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const bad of ['B' + 'x'.repeat(85), 'B' + 'x'.repeat(87), 'vapid']) {
      setup({ ...full, NEXT_PUBLIC_FIREBASE_VAPID_KEY: bad })
      expect(isPushConfigured(), `${bad.length} characters`).toBe(false)
    }
    expect(warn).toHaveBeenCalled() // and it says why, so the cause is easy to find
    warn.mockRestore()
  })

  it('treats blank (whitespace) values as missing', () => {
    setup({ ...full, NEXT_PUBLIC_FIREBASE_API_KEY: '   ' })
    expect(isPushConfigured()).toBe(false)
  })
})

describe('isValidVapidKey', () => {
  it('accepts exactly 87 URL-safe base64 characters', () => {
    expect(isValidVapidKey('B' + 'a-_Z9'.repeat(17) + 'a')).toBe(true) // 1 + 85 + 1 = 87, with - and _
    expect(isValidVapidKey('B' + 'x'.repeat(86))).toBe(true)
  })
  it('rejects the wrong length, other characters and nothing', () => {
    expect(isValidVapidKey('B' + 'x'.repeat(85))).toBe(false)
    expect(isValidVapidKey('B' + 'x'.repeat(85) + '+')).toBe(false) // not URL-safe
    expect(isValidVapidKey('B' + 'x'.repeat(85) + ' ')).toBe(false)
    expect(isValidVapidKey('')).toBe(false)
    expect(isValidVapidKey(undefined)).toBe(false)
  })
})
