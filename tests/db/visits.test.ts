import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient, anonClient } from '../helpers/supabase'
import { createFamilyMember, createSenior } from '../helpers/factories'
import { createProposedOpportunity } from '../helpers/opportunity-fixture'

// The visits table (specs/01-database/schema.md): a visit or call a family member has agreed to.
// It does not exist in the migrations yet.

const startsAt = '2026-10-15T20:00:00Z'

async function insertVisit(values: Record<string, unknown>) {
  return adminClient().from('visits').insert(values).select().single()
}

describe.skipIf(!hasTestDb())('visits', () => {
  it('stores a confirmed visit for a member', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string)

    const { data, error } = await insertVisit({
      senior_id: senior.id,
      member_id: member.id,
      kind: 'visit',
      starts_at: startsAt,
      status: 'confirmed',
    })

    expect(error).toBeNull()
    expect(data).toMatchObject({ senior_id: senior.id, member_id: member.id, kind: 'visit', status: 'confirmed' })
    expect(new Date(data.starts_at).toISOString()).toBe('2026-10-15T20:00:00.000Z')
  })

  it.each([
    ['kind', { kind: 'teleport' }],
    ['status', { status: 'maybe' }],
  ])('rejects an unknown %s', async (_name, bad) => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string)

    const { error } = await insertVisit({
      senior_id: senior.id,
      member_id: member.id,
      kind: 'visit',
      starts_at: startsAt,
      status: 'proposed',
      ...bad,
    })

    expect(error?.code).toBe('23514') // check_violation
  })

  it('allows only one live visit per opportunity, but a cancelled one can be replaced', async () => {
    const { senior, members, opportunity } = await createProposedOpportunity()
    const base = { senior_id: senior.id, member_id: members[0].id, kind: 'visit', starts_at: startsAt, opportunity_id: opportunity.id }

    const first = await insertVisit({ ...base, status: 'confirmed' })
    expect(first.error).toBeNull()

    const second = await insertVisit({ ...base, member_id: members[1].id, status: 'confirmed' })
    expect(second.error?.code).toBe('23505') // unique_violation

    await adminClient().from('visits').update({ status: 'cancelled' }).eq('id', first.data.id)
    const replacement = await insertVisit({ ...base, member_id: members[1].id, status: 'confirmed' })
    expect(replacement.error).toBeNull()
  })

  it('is removed with its senior', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string)
    await insertVisit({ senior_id: senior.id, member_id: member.id, kind: 'call', starts_at: startsAt, status: 'confirmed' })

    await adminClient().from('seniors').delete().eq('id', senior.id)

    const { count } = await adminClient().from('visits').select('id', { count: 'exact', head: true }).eq('senior_id', senior.id)
    expect(count).toBe(0)
  })

  it('keeps the visit if its opportunity is deleted', async () => {
    const { senior, members, opportunity } = await createProposedOpportunity()
    const { data: visit } = await insertVisit({
      senior_id: senior.id,
      member_id: members[0].id,
      kind: 'visit',
      starts_at: startsAt,
      status: 'confirmed',
      opportunity_id: opportunity.id,
    })

    await adminClient().from('opportunities').delete().eq('id', opportunity.id)

    const { data } = await adminClient().from('visits').select('opportunity_id').eq('id', visit.id).single()
    expect(data?.opportunity_id).toBeNull()
  })

  it('can be read with the anon key (the dashboard) but not written', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string)
    const { data: visit } = await insertVisit({
      senior_id: senior.id,
      member_id: member.id,
      kind: 'visit',
      starts_at: startsAt,
      status: 'confirmed',
    })

    const read = await anonClient().from('visits').select('id').eq('id', visit.id)
    expect(read.error).toBeNull()
    expect(read.data).toHaveLength(1)

    const write = await anonClient()
      .from('visits')
      .insert({ senior_id: senior.id, member_id: member.id, kind: 'visit', starts_at: startsAt, status: 'proposed' })
    expect(write.error?.code).toBe('42501') // permission denied
  })
})
