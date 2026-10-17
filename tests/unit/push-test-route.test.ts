import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'

// POST /api/push/test with Supabase and Firebase both faked, so no database or credentials are needed.

type Member = { name: string; fcm_token: string | null }

let member: Member | null
let dbError: { message: string } | null
const updates: { values: unknown; id: unknown }[] = []

// Fake of from('family_members').select(...).eq('id', x).maybeSingle() and .update(v).eq('id', x).
vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member, error: dbError }) }) }),
      update: (values: unknown) => ({
        eq: async (_column: string, id: unknown) => {
          updates.push({ values, id })
          return { error: null }
        },
      }),
    }),
  }),
}))

const send = vi.fn()
vi.mock('@/lib/firebase/admin', () => ({ getAdminMessaging: () => ({ send }) }))

import { POST } from '@/app/api/push/test/route'

const memberId = randomUUID()
const post = (body: unknown) => callRoute(POST, '/api/push/test', { body })

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  dbError = null
  member = { name: 'Danny Smith', fcm_token: 'tok-danny' }
  send.mockResolvedValue('projects/p/messages/1')
})

describe('POST /api/push/test', () => {
  it('sends a test push to that member\'s stored token and returns 200', async () => {
    const res = await post({ member_id: memberId })

    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({
      token: 'tok-danny',
      notification: { title: expect.any(String), body: expect.stringContaining('Danny') },
    })
  })

  it('gives the push an absolute link when NEXT_PUBLIC_APP_URL is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
    await post({ member_id: memberId })
    expect(send.mock.calls[0][0].webpush.fcmOptions.link).toBe('https://app.example.com/')
    vi.unstubAllEnvs()
  })

  it('omits the link when no valid app URL is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    await post({ member_id: memberId })
    expect(send.mock.calls[0][0].webpush).not.toHaveProperty('fcmOptions')
    vi.unstubAllEnvs()
  })

  it('never returns the token', async () => {
    const res = await post({ member_id: memberId })
    expect(JSON.stringify(res.json)).not.toContain('tok-danny')
  })

  describe('validation (400 Bad Request)', () => {
    it.each([
      ['member_id is missing', {}],
      ['member_id is not a UUID', { member_id: 'nope' }],
      ['the body is not an object', [memberId]],
    ])('rejects a request when %s, without calling Firebase', async (_name, body) => {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect(send).not.toHaveBeenCalled()
    })
  })

  it('returns 404 for a member that does not exist', async () => {
    member = null
    const res = await post({ member_id: memberId })
    expect(res.status).toBe(404)
    expect(send).not.toHaveBeenCalled()
  })

  it('returns 409 when the member has not registered a token yet', async () => {
    member = { name: 'Danny Smith', fcm_token: null }
    const res = await post({ member_id: memberId })
    expect(res.status).toBe(409)
    expect(res.json.error).toMatch(/token/i)
    expect(send).not.toHaveBeenCalled()
  })

  it('returns 500 when the database lookup fails', async () => {
    dbError = { message: 'boom' }
    member = null
    const res = await post({ member_id: memberId })
    expect(res.status).toBe(500)
    expect(send).not.toHaveBeenCalled()
  })

  describe('when Firebase fails', () => {
    it('returns 502 for a transient error and keeps the token', async () => {
      send.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'messaging/server-unavailable' }))

      const res = await post({ member_id: memberId })

      expect(res.status).toBe(502)
      expect(updates).toEqual([])
    })

    it('returns 410 and clears the token when Firebase says it is dead', async () => {
      send.mockRejectedValue(
        Object.assign(new Error('gone'), { code: 'messaging/registration-token-not-registered' }),
      )

      const res = await post({ member_id: memberId })

      expect(res.status).toBe(410)
      expect(updates).toEqual([{ values: { fcm_token: null }, id: memberId }])
    })

    it('does not leak the token or Firebase internals in the error', async () => {
      send.mockRejectedValue(new Error('failed for token tok-danny: secret detail'))

      const res = await post({ member_id: memberId })

      expect(JSON.stringify(res.json)).not.toMatch(/tok-danny|secret detail/)
    })
  })
})
