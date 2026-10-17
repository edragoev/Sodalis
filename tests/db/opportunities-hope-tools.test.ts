import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient } from '../helpers/supabase'
import { createCheckIn, createFamilyMember, createSenior } from '../helpers/factories'

// specs/08-agents/hope-tools.md: Hope's propose_visit creates an opportunity DURING the call,
// before the check-in row exists. It is tied to the call by check_in_vapi_call_id, and the
// webhook links it to the check-in afterwards.

const insert = (values: Record<string, unknown>) =>
  adminClient().from('opportunities').insert(values).select().single()

const midCall = (seniorId: string, extra: Record<string, unknown> = {}) => ({
  senior_id: seniorId,
  type: 'wants_contact',
  summary: 'Misses Danny',
  source: 'hope_tool',
  check_in_vapi_call_id: 'call-abc',
  ...extra,
})

describe.skipIf(!hasTestDb())('opportunities created mid-call by Hope', () => {
  it('can exist without a check-in when it carries the Vapi call id', async () => {
    const senior = await createSenior()
    const { data, error } = await insert(midCall(senior.id as string))
    expect(error).toBeNull()
    expect(data).toMatchObject({ check_in_id: null, source: 'hope_tool', check_in_vapi_call_id: 'call-abc' })
  })

  it('must have a check-in or a Vapi call id', async () => {
    const senior = await createSenior()
    const { error } = await insert({ senior_id: senior.id, type: 'activity', summary: 'Cards' })
    expect(error?.code).toBe('23514') // check_violation
  })

  it('defaults source to extraction and accepts only extraction or hope_tool', async () => {
    const senior = await createSenior()
    const checkIn = await createCheckIn(senior.id as string)
    const ok = await insert({ senior_id: senior.id, check_in_id: checkIn.id, type: 'activity', summary: 'Cards' })
    expect(ok.data?.source).toBe('extraction')

    const bad = await insert(midCall(senior.id as string, { source: 'magic' }))
    expect(bad.error?.code).toBe('23514')
  })

  it('is idempotent per call + member + type', async () => {
    const senior = await createSenior()
    const danny = await createFamilyMember(senior.id as string, { name: 'Danny' })

    const first = await insert(midCall(senior.id as string, { mentioned_member_id: danny.id }))
    expect(first.error).toBeNull()

    const dup = await insert(midCall(senior.id as string, { mentioned_member_id: danny.id }))
    expect(dup.error?.code).toBe('23505') // unique_violation
  })

  it('treats "no member named" as one slot too, so a retry cannot double up', async () => {
    const senior = await createSenior()
    expect((await insert(midCall(senior.id as string))).error).toBeNull()
    expect((await insert(midCall(senior.id as string))).error?.code).toBe('23505')
  })

  it('allows a different type, a different member, or a different call', async () => {
    const senior = await createSenior()
    const danny = await createFamilyMember(senior.id as string, { name: 'Danny' })
    const maya = await createFamilyMember(senior.id as string, { name: 'Maya' })
    const id = senior.id as string

    expect((await insert(midCall(id, { mentioned_member_id: danny.id }))).error).toBeNull()
    expect((await insert(midCall(id, { mentioned_member_id: danny.id, type: 'activity' }))).error).toBeNull()
    expect((await insert(midCall(id, { mentioned_member_id: maya.id }))).error).toBeNull()
    expect((await insert(midCall(id, { mentioned_member_id: danny.id, check_in_vapi_call_id: 'call-xyz' }))).error).toBeNull()
  })

  it('can be linked to the check-in once the end-of-call report arrives', async () => {
    const senior = await createSenior()
    const { data: opp } = await insert(midCall(senior.id as string))
    const checkIn = await createCheckIn(senior.id as string, { vapi_call_id: 'call-abc' })

    const { data, error } = await adminClient()
      .from('opportunities')
      .update({ check_in_id: checkIn.id })
      .eq('check_in_vapi_call_id', 'call-abc')
      .eq('senior_id', senior.id)
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBe(opp?.id)
    expect(data?.check_in_id).toBe(checkIn.id)
  })
})
