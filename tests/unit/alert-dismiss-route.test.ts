import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'

// POST /api/alerts/[id]/dismiss with Supabase faked: who may dismiss an alert, and what gets written.

const seniorId = randomUUID()
const alertId = randomUUID()
const memberId = randomUUID()

let alert: { senior_id: string; acknowledged_by: string | null } | null
let member: { senior_id: string } | null
const updates: { values: unknown; id: unknown }[] = []

// Fake of from(t).select(...).eq('id', x).maybeSingle() and from('alerts').update(v).eq('id', x).is(...).
vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: table === 'alerts' ? alert : member, error: null }) }),
      }),
      update: (values: unknown) => ({
        eq: (_column: string, id: unknown) => ({
          is: async () => {
            updates.push({ values, id })
            return { error: null }
          },
        }),
      }),
    }),
  }),
}))

import { POST } from '@/app/api/alerts/[id]/dismiss/route'

const dismiss = (body: unknown, id = alertId) => callRoute(POST, `/api/alerts/${id}/dismiss`, { body, params: { id } })

beforeEach(() => {
  updates.length = 0
  alert = { senior_id: seniorId, acknowledged_by: null }
  member = { senior_id: seniorId }
})

describe('POST /api/alerts/[id]/dismiss', () => {
  it('marks the alert acknowledged by that member', async () => {
    const res = await dismiss({ member_id: memberId })
    expect(res.status).toBe(200)
    expect(updates).toEqual([{ values: { acknowledged_by: memberId }, id: alertId }])
  })

  it('refuses a member from another family and writes nothing', async () => {
    member = { senior_id: randomUUID() }
    const res = await dismiss({ member_id: memberId })
    expect(res.status).toBe(403)
    expect(updates).toHaveLength(0)
  })

  it('returns 404 for an unknown alert', async () => {
    alert = null
    expect((await dismiss({ member_id: memberId })).status).toBe(404)
  })

  it('treats an already dismissed alert as done without writing again', async () => {
    alert = { senior_id: seniorId, acknowledged_by: randomUUID() }
    const res = await dismiss({ member_id: memberId })
    expect(res.status).toBe(200)
    expect(updates).toHaveLength(0)
  })

  it('rejects a missing or malformed id with 400', async () => {
    expect((await dismiss({})).status).toBe(400)
    expect((await dismiss({ member_id: 'nope' })).status).toBe(400)
    expect((await dismiss({ member_id: memberId }, 'not-a-uuid')).status).toBe(400)
  })
})
