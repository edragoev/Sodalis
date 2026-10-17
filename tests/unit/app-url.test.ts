import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAppUrl } from '@/lib/app-url'

// FCM only accepts an absolute HTTPS URL for a notification's click link, so push code needs
// the app's public origin. getAppUrl returns it, or null when there is no usable one.

describe('getAppUrl', () => {
  it('returns the origin from NEXT_PUBLIC_APP_URL', () => {
    expect(getAppUrl({ NEXT_PUBLIC_APP_URL: 'https://app.example.com' })).toBe('https://app.example.com')
  })

  it('drops a trailing slash, path, query and hash', () => {
    expect(getAppUrl({ NEXT_PUBLIC_APP_URL: 'https://app.example.com/some/path/?x=1#top' })).toBe(
      'https://app.example.com',
    )
  })

  it('keeps a non-default port', () => {
    expect(getAppUrl({ NEXT_PUBLIC_APP_URL: 'https://app.example.com:8443/' })).toBe('https://app.example.com:8443')
  })

  it('falls back to the Vercel production domain, which has no scheme', () => {
    expect(getAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'sodalis.vercel.app' })).toBe('https://sodalis.vercel.app')
  })

  it('prefers the explicit setting over Vercel\'s', () => {
    expect(
      getAppUrl({ NEXT_PUBLIC_APP_URL: 'https://app.example.com', VERCEL_PROJECT_PRODUCTION_URL: 'sodalis.vercel.app' }),
    ).toBe('https://app.example.com')
  })

  it('refuses http, because FCM would reject the link', () => {
    expect(getAppUrl({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })).toBeNull()
  })

  it.each(['', '   ', 'not a url', 'javascript:alert(1)', 'ftp://app.example.com', '//app.example.com'])(
    'returns null for %j',
    (value) => {
      expect(getAppUrl({ NEXT_PUBLIC_APP_URL: value })).toBeNull()
    },
  )

  it('returns null when nothing is configured', () => {
    expect(getAppUrl({})).toBeNull()
  })

  it('does not fall back to Vercel when the explicit setting is present but invalid', () => {
    // A typo should be noticed, not silently replaced by a different domain.
    expect(
      getAppUrl({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000', VERCEL_PROJECT_PRODUCTION_URL: 'sodalis.vercel.app' }),
    ).toBeNull()
  })
})

describe('.env.example', () => {
  it('documents NEXT_PUBLIC_APP_URL so deployers know to set it', () => {
    const example = readFileSync(path.resolve(import.meta.dirname, '../../.env.example'), 'utf8')
    expect(example).toMatch(/^NEXT_PUBLIC_APP_URL=/m)
  })
})
