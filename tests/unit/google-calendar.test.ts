import { beforeEach, describe, expect, it } from 'vitest'
import { fetchBusyWindows, refreshGoogleAccessToken } from '@/lib/google/calendar'

describe('Google Calendar token refresh', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'cid'
    process.env.GOOGLE_CLIENT_SECRET = 'secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'
  })

  it('uses the refresh token grant and returns a new access token', async () => {
    const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      expect(url).toBe('https://oauth2.googleapis.com/token')

      const body = new URLSearchParams(init?.body as string)
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('refresh-123')
      expect(body.get('client_id')).toBe('cid')
      expect(body.get('client_secret')).toBe('secret')

      return new Response(JSON.stringify({ access_token: 'new-access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    await expect(refreshGoogleAccessToken('refresh-123', fetchFn)).resolves.toBe('new-access-token')
  })

  it('throws when Google rejects the refresh request', async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })

    await expect(refreshGoogleAccessToken('bad-refresh', fetchFn)).rejects.toThrow('Google token refresh failed')
  })
})

describe('Google Calendar free/busy fetch', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'cid'
    process.env.GOOGLE_CLIENT_SECRET = 'secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'
  })

  it('refreshes the token and parses the busy windows from the primary calendar', async () => {
    const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'access-456' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      expect(url).toBe('https://www.googleapis.com/calendar/v3/freeBusy')
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer access-456')

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

    await expect(
      fetchBusyWindows({
        refreshToken: 'refresh-456',
        timeMin: '2026-10-18T00:00:00Z',
        timeMax: '2026-10-19T00:00:00Z',
        fetchFn,
      }),
    ).resolves.toEqual([
      { start: '2026-10-18T09:00:00Z', end: '2026-10-18T10:00:00Z' },
      { start: '2026-10-18T14:00:00Z', end: '2026-10-18T15:30:00Z' },
    ])
  })

  it('throws when Google rejects the free/busy request', async () => {
    const fetchFn = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'access-ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }

    await expect(
      fetchBusyWindows({
        refreshToken: 'refresh-403',
        timeMin: '2026-10-18T00:00:00Z',
        timeMax: '2026-10-19T00:00:00Z',
        fetchFn,
      }),
    ).rejects.toThrow('Google free/busy request failed')
  })
})
