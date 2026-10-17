import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { getTestEnv, hasTestDb } from '../helpers/env'
import { callRoute } from '../helpers/route'
import { adminClient } from '../helpers/supabase'
import { createFamilyMember, createSenior } from '../helpers/factories'
import { createProposedOpportunity } from '../helpers/opportunity-fixture'

// POST /api/schedule/confirm against the real test database, including the race between members.

beforeAll(() => {
  if (!hasTestDb()) return
  const env = getTestEnv()
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey
})

// Loaded per call so a missing route fails each test clearly instead of breaking the whole file.
async function confirm(body: unknown) {
  const { POST } = await import('@/app/api/schedule/confirm/route')
  return callRoute(POST, '/api/schedule/confirm', { body })
}

const params = (opportunity: any, member: any, slot = 'slot-a') => ({
  opportunity_id: opportunity.id,
  slot_id: slot,
  member_id: member.id,
})

describe.skipIf(!hasTestDb())('POST /api/schedule/confirm', () => {
  it('confirms the slot, returns the new visit id, and books the visit', async () => {
    const { members, opportunity } = await createProposedOpportunity()

    const res = await confirm(params(opportunity, members[0]))

    expect(res.status).toBe(200)
    const { data: visits } = await adminClient().from('visits').select('id, member_id, status').eq('opportunity_id', opportunity.id)
    expect(visits).toEqual([{ id: res.json.visit_id, member_id: members[0].id, status: 'confirmed' }])
  })

  it('tells a late member who got there first (409)', async () => {
    const { members, opportunity } = await createProposedOpportunity()
    await confirm(params(opportunity, members[0]))

    const res = await confirm(params(opportunity, members[1], 'slot-b'))

    expect(res.status).toBe(409)
    expect(res.json).toMatchObject({ covered_by: 'Member0' })
  })

  it('gives exactly one winner when two members confirm at the same moment', async () => {
    const { members, opportunity } = await createProposedOpportunity()

    const results = await Promise.all([
      confirm(params(opportunity, members[0], 'slot-a')),
      confirm(params(opportunity, members[1], 'slot-b')),
    ])

    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const { count } = await adminClient().from('visits').select('id', { count: 'exact', head: true }).eq('opportunity_id', opportunity.id)
    expect(count).toBe(1)
  })

  describe('validation (400 Bad Request)', () => {
    const ids = { opportunity_id: randomUUID(), member_id: randomUUID(), slot_id: 'slot-a' }

    it.each([
      ['opportunity_id is missing', { ...ids, opportunity_id: undefined }],
      ['opportunity_id is not a UUID', { ...ids, opportunity_id: 'nope' }],
      ['member_id is missing', { ...ids, member_id: undefined }],
      ['member_id is not a UUID', { ...ids, member_id: 'nope' }],
      ['slot_id is missing', { ...ids, slot_id: undefined }],
      ['slot_id is empty', { ...ids, slot_id: '  ' }],
      ['slot_id is not a string', { ...ids, slot_id: 7 }],
      ['slot_id is absurdly long', { ...ids, slot_id: 'x'.repeat(500) }],
    ])('rejects a request when %s', async (_name, body) => {
      const res = await confirm(body)
      expect(res.status).toBe(400)
      expect(res.json.error).toEqual(expect.any(String))
    })
  })

  it('returns 404 for an opportunity that does not exist', async () => {
    const { members } = await createProposedOpportunity()
    const res = await confirm({ opportunity_id: randomUUID(), slot_id: 'slot-a', member_id: members[0].id })
    expect(res.status).toBe(404)
  })

  it('returns 400 for a slot that was never offered', async () => {
    const { members, opportunity } = await createProposedOpportunity()
    const res = await confirm(params(opportunity, members[0], 'slot-zzz'))
    expect(res.status).toBe(400)
  })

  it('returns 403 when the member belongs to a different family', async () => {
    const { opportunity } = await createProposedOpportunity()
    const stranger = await createFamilyMember((await createSenior()).id as string)

    const res = await confirm(params(opportunity, stranger))

    expect(res.status).toBe(403)
  })

  it.each(['declined', 'expired'])('returns 410 Gone for a %s opportunity', async (status) => {
    const { members, opportunity } = await createProposedOpportunity(2, { status })
    const res = await confirm(params(opportunity, members[0]))
    expect(res.status).toBe(410)
  })
})
