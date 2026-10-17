import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient } from '../helpers/supabase'
import { createCheckIn, createFamilyMember, createSenior } from '../helpers/factories'

const base = (seniorId: string, checkInId: string) => ({
  senior_id: seniorId,
  check_in_id: checkInId,
  type: 'gift_errand',
  summary: 'Has extra zucchini',
})

const insert = (values: Record<string, unknown>) =>
  adminClient().from('opportunities').insert(values).select().single()

async function setup() {
  const senior = await createSenior()
  const checkIn = await createCheckIn(senior.id as string)
  return { seniorId: senior.id as string, checkInId: checkIn.id as string }
}

describe.skipIf(!hasTestDb())('opportunities', () => {
  it('applies defaults for status, urgency and the array/json columns', async () => {
    const { seniorId, checkInId } = await setup()

    const { data, error } = await insert(base(seniorId, checkInId))

    expect(error).toBeNull()
    expect(data).toMatchObject({
      status: 'detected',
      urgency: 'normal',
      interest_tags: [],
      notified_member_ids: [],
      proposed_slots: [],
    })
  })

  it.each([
    ['type', { type: 'birthday_party' }],
    ['status', { status: 'done' }],
    ['urgency', { urgency: 'asap' }],
    ['suggested_kind', { suggested_kind: 'letter' }],
    ['confidence above 1', { confidence: 1.5 }],
    ['confidence below 0', { confidence: -0.1 }],
  ])('rejects an invalid %s', async (_label, extra) => {
    const { seniorId, checkInId } = await setup()
    const { error } = await insert({ ...base(seniorId, checkInId), ...extra })
    expect(error?.code).toBe('23514') // check_violation
  })

  it('rejects a check_in_id that does not exist', async () => {
    const { seniorId } = await setup()
    const { error } = await insert(base(seniorId, randomUUID()))
    expect(error?.code).toBe('23503') // foreign_key_violation
  })

  it('deleting a senior removes their opportunities', async () => {
    const { seniorId, checkInId } = await setup()
    const { data } = await insert(base(seniorId, checkInId))

    await adminClient().from('seniors').delete().eq('id', seniorId)

    const { data: left } = await adminClient().from('opportunities').select('id').eq('id', data!.id)
    expect(left).toHaveLength(0)
  })

  it('keeps the opportunity when a mentioned family member is deleted', async () => {
    const { seniorId, checkInId } = await setup()
    const member = await createFamilyMember(seniorId)
    const { data } = await insert({ ...base(seniorId, checkInId), mentioned_member_id: member.id })

    await adminClient().from('family_members').delete().eq('id', member.id)

    const { data: after } = await adminClient()
      .from('opportunities')
      .select('mentioned_member_id')
      .eq('id', data!.id)
      .single()
    expect(after).toEqual({ mentioned_member_id: null })
  })
})
