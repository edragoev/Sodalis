import { beforeEach, describe, expect, it } from 'vitest'
import { decryptToken, encryptToken } from '@/lib/google/crypto'
import { fetchBusyWindows, refreshGoogleAccessToken } from '@/lib/google/calendar'
import { consentUrl, SCOPE } from '@/lib/google/oauth'
import { createState, readNonce, verifyState } from '@/lib/google/state'

const MEMBER = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  process.env.ENCRYPTION_KEY = 'test-secret'
  process.env.GOOGLE_CLIENT_ID = 'cid'
  process.env.GOOGLE_CLIENT_SECRET = 'secret'
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'
})

describe('token encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const stored = encryptToken('1//refresh')
    expect(stored.startsWith('v1:')).toBe(true)
    expect(stored).not.toContain('1//refresh')
    expect(decryptToken(stored)).toBe('1//refresh')
  })

  it('uses a fresh IV each time and rejects tampering', () => {
    expect(encryptToken('x')).not.toBe(encryptToken('x'))
    const [v, iv, tag, data] = encryptToken('x').split(':')
    expect(() => decryptToken([v, iv, tag, data.slice(0, -2) + 'AA'].join(':'))).toThrow()
  })
})

describe('oauth state', () => {
  it('verifies for the same browser', () => {
    const { state, nonce } = createState(MEMBER)
    expect(verifyState(state, nonce)).toBe(MEMBER)
  })

  it('rejects a missing, wrong or expired nonce and a tampered state', () => {
    const { state, nonce } = createState(MEMBER, 0)
    expect(verifyState(state, undefined)).toBeNull()
    expect(verifyState(state, 'other', 0)).toBeNull()
    expect(verifyState(state, nonce, 11 * 60 * 1000)).toBeNull()
    expect(verifyState(state.replace(/.$/, 'x'), nonce, 0)).toBeNull()
  })

  it('reads the nonce from the cookie header', () => {
    const req = new Request('http://x', { headers: { cookie: 'a=1; google_oauth_nonce=abc' } })
    expect(readNonce(req)).toBe('abc')
  })
})

describe('consent url', () => {
  it('asks for offline, free/busy access', () => {
    const url = new URL(consentUrl('s'))
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('scope')).toBe(SCOPE)
    expect(url.searchParams.get('state')).toBe('s')
  })
})

describe('calendar free/busy fetch', () => {
  it('refreshes the token and parses busy windows', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      calls.push({ url, init })

      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'token-123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.includes('www.googleapis.com/calendar/v3/freeBusy')) {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  { start: '2026-10-18T09:00:00Z', end: '2026-10-18T10:00:00Z' },
                  { start: '2026-10-18T14:00:00Z', end: '2026-10-18T15:30:00Z' },
                ],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      throw new Error(`unexpected URL: ${url}`)
    }

    const token = await refreshGoogleAccessToken('refresh-token-1', fetchFn)
    expect(token).toBe('token-123')

    const windows = await fetchBusyWindows({
      refreshToken: 'refresh-token-1',
      timeMin: '2026-10-18T00:00:00Z',
      timeMax: '2026-10-19T00:00:00Z',
      fetchFn,
    })

    expect(windows).toEqual([
      { start: '2026-10-18T09:00:00Z', end: '2026-10-18T10:00:00Z' },
      { start: '2026-10-18T14:00:00Z', end: '2026-10-18T15:30:00Z' },
    ])
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })
})
