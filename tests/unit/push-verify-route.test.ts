import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'

// POST /api/push/verify with Supabase and Firebase both faked, so no database or credentials are needed.

type Member = { fcm_token: string | null }

let member: Member | null
let dbError: { message: string } | null
const updates: { values: unknown; id: unknown }[] = []

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

import { POST } from '@/app/api/push/verify/route'

const memberId = randomUUID()
const post = (body: unknown) => callRoute(POST, '/api/push/verify', { body })
const fcmError = (code: string) => Object.assign(new Error('fcm said no'), { code })

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  dbError = null
  member = { fcm_token: 'tok-danny' }
  send.mockResolvedValue('projects/p/messages/1')
})

describe('POST /api/push/verify', () => {
  it('dry-runs the stored token, returns 200, and keeps the token', async () => {
    const res = await post({ member_id: memberId })

    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok-danny' }), true)
    expect(updates).toEqual([])
  })

  it.each(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'])(
    'clears the token and returns 410 when Firebase says %s',
    async (code) => {
      send.mockRejectedValue(fcmError(code))
      const res = await post({ member_id: memberId })

      expect(res.status).toBe(410)
      expect(updates).toEqual([{ values: { fcm_token: null }, id: memberId }])
    },
  )

  it('keeps the token and returns 502 on a transient Firebase error, without leaking details', async () => {
    send.mockRejectedValue(fcmError('messaging/internal-error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ member_id: memberId })

    expect(res.status).toBe(502)
    expect(updates).toEqual([])
    expect(JSON.stringify(res.json)).not.toContain('tok-danny')
    expect(JSON.stringify(res.json)).not.toContain('fcm said no')
  })

  it('returns 409 and does not call Firebase when no token is registered', async () => {
    member = { fcm_token: null }
    const res = await post({ member_id: memberId })

    expect(res.status).toBe(409)
    expect(send).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown member', async () => {
    member = null
    expect((await post({ member_id: memberId })).status).toBe(404)
  })

  it('returns 500 when the lookup fails', async () => {
    dbError = { message: 'boom' }
    expect((await post({ member_id: memberId })).status).toBe(500)
  })

  it('rejects a member_id that is not a UUID', async () => {
    const res = await post({ member_id: 'nope' })

    expect(res.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })
})
