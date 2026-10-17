import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'

// POST /api/schedule/confirm with the database faked: this checks the HTTP mapping only.
// The atomic claim itself is the Postgres function confirm_opportunity_slot (see tests/db).

const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: () => ({ rpc }) }))

import { POST } from '@/app/api/schedule/confirm/route'

const ids = { opportunity_id: randomUUID(), member_id: randomUUID(), slot_id: 'slot-a' }
const post = (body: unknown) => callRoute(POST, '/api/schedule/confirm', { body })

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: { outcome: 'confirmed', visit_id: 'v-1' }, error: null })
})

describe('POST /api/schedule/confirm', () => {
  it('asks the database function to claim the slot, once, with the request\'s ids', async () => {
    await post(ids)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('confirm_opportunity_slot', {
      p_opportunity_id: ids.opportunity_id,
      p_slot_id: 'slot-a',
      p_member_id: ids.member_id,
    })
  })

  it.each([
    ['confirmed', { outcome: 'confirmed', visit_id: 'v-1' }, 200, { visit_id: 'v-1' }],
    ['already_covered', { outcome: 'already_covered', covered_by: 'Maya' }, 409, { covered_by: 'Maya' }],
    ['already_covered with no name', { outcome: 'already_covered', covered_by: null }, 409, { covered_by: null }],
    ['not_open', { outcome: 'not_open' }, 410, {}],
    ['slot_not_found', { outcome: 'slot_not_found' }, 400, {}],
    ['not_family', { outcome: 'not_family' }, 403, {}],
    ['not_found', { outcome: 'not_found' }, 404, {}],
  ])('maps %s to HTTP %i', async (_name, data, status, expected) => {
    rpc.mockResolvedValue({ data, error: null })

    const res = await post(ids)

    expect(res.status).toBe(status)
    expect(res.json).toMatchObject(expected)
  })

  it('gives every refusal a readable error message', async () => {
    for (const outcome of ['already_covered', 'not_open', 'slot_not_found', 'not_family', 'not_found']) {
      rpc.mockResolvedValue({ data: { outcome }, error: null })
      expect((await post(ids)).json.error).toMatch(/\S/)
    }
  })

  it('returns only what the screen needs on success', async () => {
    const res = await post(ids)
    expect(Object.keys(res.json)).toEqual(['visit_id'])
  })

  it('returns a generic 500, without database detail, when the function call fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'relation "visits" does not exist', code: '42P01' } })

    const res = await post(ids)

    expect(res.status).toBe(500)
    expect(JSON.stringify(res.json)).not.toMatch(/relation|visits|42P01/)
  })

  it('returns 500 for an outcome it does not know, rather than pretending it worked', async () => {
    rpc.mockResolvedValue({ data: { outcome: 'surprise' }, error: null })
    expect((await post(ids)).status).toBe(500)
  })

  describe('validation (400 Bad Request), without touching the database', () => {
    it.each([
      ['the body is not JSON', undefined],
      ['the body is an array', [ids]],
      ['opportunity_id is not a UUID', { ...ids, opportunity_id: 'x' }],
      ['member_id is not a UUID', { ...ids, member_id: 'x' }],
      ['slot_id is missing', { ...ids, slot_id: undefined }],
      ['slot_id is blank', { ...ids, slot_id: '   ' }],
      ['slot_id is not a string', { ...ids, slot_id: 5 }],
      ['slot_id is absurdly long', { ...ids, slot_id: 'x'.repeat(500) }],
    ])('rejects a request when %s', async (_name, body) => {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect(rpc).not.toHaveBeenCalled()
    })
  })
})
