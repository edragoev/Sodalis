import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'

// The service-role client is mocked, so no database is needed.
const single = vi.fn()
const select = vi.fn(() => ({ single }))
const insert = vi.fn(() => ({ select }))
const from = vi.fn(() => ({ insert }))

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
}))

import { POST } from '@/app/api/opportunities/route'

const valid = {
  senior_id: '11111111-1111-4111-8111-111111111111',
  check_in_id: '22222222-2222-4222-8222-222222222222',
  type: 'gift_errand',
  summary: 'Has extra zucchini',
  quote: 'My zucchini are out of control.',
  mentioned_item: 'zucchini',
  interest_tags: ['gardening'],
  urgency: 'normal',
  confidence: 0.9,
}

const post = (body: unknown) => callRoute(POST, '/api/opportunities', { body })

beforeEach(() => {
  vi.clearAllMocks()
  single.mockResolvedValue({ data: { id: 'opp-1', status: 'detected', ...valid }, error: null })
})

describe('POST /api/opportunities', () => {
  describe('validation (400 Bad Request)', () => {
    it.each(['senior_id', 'check_in_id', 'type', 'summary'])(
      'rejects a payload missing %s',
      async (field) => {
        const body: Record<string, unknown> = { ...valid }
        delete body[field]

        const res = await post(body)

        expect(res.status).toBe(400)
        expect(res.json.error).toContain(field)
        expect(insert).not.toHaveBeenCalled()
      }
    )

    it('rejects a blank required field', async () => {
      const res = await post({ ...valid, summary: '   ' })
      expect(res.status).toBe(400)
      expect(insert).not.toHaveBeenCalled()
    })

    it('rejects an unknown opportunity type', async () => {
      const res = await post({ ...valid, type: 'birthday_party' })
      expect(res.status).toBe(400)
      expect(res.json.error).toContain('type')
    })

    // Bad values must be stopped before the database, so none of these may reach insert().
    it.each([
      ['confidence above 1', { confidence: 1.5 }, 'confidence'],
      ['confidence below 0', { confidence: -0.1 }, 'confidence'],
      ['confidence that is not a number', { confidence: '0.9' }, 'confidence'],
      ['a non-UUID senior_id', { senior_id: 'not-a-uuid' }, 'senior_id'],
      ['a non-UUID check_in_id', { check_in_id: '123' }, 'check_in_id'],
      ['a non-UUID mentioned_member_id', { mentioned_member_id: 'danny' }, 'mentioned_member_id'],
      ['interest_tags that is not an array', { interest_tags: 'gardening' }, 'interest_tags'],
      ['interest_tags with non-string items', { interest_tags: ['gardening', 42] }, 'interest_tags'],
      ['an unknown urgency', { urgency: 'asap' }, 'urgency'],
      ['an unknown suggested_kind', { suggested_kind: 'letter' }, 'suggested_kind'],
      ['a target_date that is not a date', { target_date: 'next tuesday' }, 'target_date'],
    ])('rejects %s with a clean 400', async (_label, extra, field) => {
      const res = await post({ ...valid, ...extra })

      expect(res.status).toBe(400)
      expect(res.json.error).toContain(field)
      expect(insert).not.toHaveBeenCalled()
    })

    it.each([['null', null], ['an array', []], ['a string', 'hello']])(
      'rejects a body that is %s',
      async (_label, body) => {
        const res = await post(body)
        expect(res.status).toBe(400)
        expect(insert).not.toHaveBeenCalled()
      }
    )

    it('rejects a body that is not valid JSON', async () => {
      const res = await callRoute(POST, '/api/opportunities', {
        headers: { 'content-type': 'application/json' },
        body: undefined,
      })
      expect(res.status).toBe(400)
      expect(insert).not.toHaveBeenCalled()
    })
  })

  describe('success (201 Created)', () => {
    it('inserts a valid payload and returns the record', async () => {
      const res = await post(valid)

      expect(res.status).toBe(201)
      expect(res.json).toMatchObject({ id: 'opp-1', type: 'gift_errand', summary: 'Has extra zucchini' })
      expect(from).toHaveBeenCalledWith('opportunities')
      expect(insert).toHaveBeenCalledWith(expect.objectContaining(valid))
    })

    it('accepts a payload with only the required fields', async () => {
      const required = {
        senior_id: valid.senior_id,
        check_in_id: valid.check_in_id,
        type: 'activity',
        summary: 'Loves cards',
      }
      const res = await post(required)
      expect(res.status).toBe(201)
      expect(insert).toHaveBeenCalledWith(required)
    })

    it('ignores fields the client is not allowed to set', async () => {
      await post({ ...valid, id: 'forged', status: 'confirmed', accepted_by: 'someone' })

      const inserted = (insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>
      expect(inserted).not.toHaveProperty('id')
      expect(inserted).not.toHaveProperty('status')
      expect(inserted).not.toHaveProperty('accepted_by')
    })
  })

  describe('database errors', () => {
    it('returns 500 when the insert fails', async () => {
      single.mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX000' } })
      const res = await post(valid)
      expect(res.status).toBe(500)
      expect(res.json.error).toBeTruthy()
    })

    it('returns 400, not 500, if a check constraint still rejects the row', async () => {
      single.mockResolvedValue({ data: null, error: { message: 'check', code: '23514' } })
      const res = await post(valid)
      expect(res.status).toBe(400)
    })

    it('returns 400 when the referenced senior or check-in does not exist', async () => {
      single.mockResolvedValue({ data: null, error: { message: 'fk', code: '23503' } })
      const res = await post(valid)
      expect(res.status).toBe(400)
    })
  })
})
