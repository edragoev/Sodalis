import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient, anonClient } from '../helpers/supabase'
import { createFamilyMember, createSenior } from '../helpers/factories'
import { createProposedOpportunity, SLOTS } from '../helpers/opportunity-fixture'

// confirm_opportunity_slot: the first member to accept claims the opportunity, atomically
// (specs/06-notifications/conversation-to-visit.md section 7). One call does the claim and the
// visit insert in a single transaction, so there is never a claim without a visit.
// It returns { outcome, visit_id?, covered_by? }.

type Outcome = {
  outcome: 'confirmed' | 'already_covered' | 'not_open' | 'slot_not_found' | 'not_family' | 'not_found'
  visit_id?: string
  covered_by?: string | null
}

async function confirm(opportunityId: unknown, slotId: string, memberId: unknown) {
  const { data, error } = await adminClient().rpc('confirm_opportunity_slot', {
    p_opportunity_id: opportunityId,
    p_slot_id: slotId,
    p_member_id: memberId,
  })
  expect(error).toBeNull()
  return data as Outcome
}

const visitsFor = async (opportunityId: unknown) =>
  ((await adminClient().from('visits').select('*').eq('opportunity_id', opportunityId)).data ?? []) as Record<string, any>[]

const opportunityRow = async (id: unknown) =>
  (await adminClient().from('opportunities').select('status, accepted_by').eq('id', id).single()).data as {
    status: string
    accepted_by: string | null
  }

describe.skipIf(!hasTestDb())('confirm_opportunity_slot', () => {
  describe('the first member to accept', () => {
    it('claims the opportunity and gets a confirmed visit at the chosen slot', async () => {
      const { senior, members, opportunity } = await createProposedOpportunity()

      const result = await confirm(opportunity.id, 'slot-a', members[0].id)

      expect(result.outcome).toBe('confirmed')
      expect(await opportunityRow(opportunity.id)).toEqual({ status: 'confirmed', accepted_by: members[0].id })

      const visits = await visitsFor(opportunity.id)
      expect(visits).toHaveLength(1)
      expect(visits[0]).toMatchObject({
        id: result.visit_id,
        senior_id: senior.id,
        member_id: members[0].id,
        opportunity_id: opportunity.id,
        kind: 'visit',
        status: 'confirmed',
      })
      expect(new Date(visits[0].starts_at).toISOString()).toBe(new Date(SLOTS[0].starts_at).toISOString())
      expect(new Date(visits[0].ends_at).getTime()).toBeGreaterThan(new Date(visits[0].starts_at).getTime())
    })

    it.each([
      ['call', 'call'],
      ['visit', 'visit'],
      [null, 'visit'],
    ])('makes a %s opportunity a %s', async (suggested, expected) => {
      const { members, opportunity } = await createProposedOpportunity(2, { suggested_kind: suggested })
      await confirm(opportunity.id, 'slot-b', members[0].id)
      expect((await visitsFor(opportunity.id))[0].kind).toBe(expected)
    })
  })

  describe('everyone else', () => {
    it('is told who got there first, and no second visit is made', async () => {
      const { members, opportunity } = await createProposedOpportunity()
      await confirm(opportunity.id, 'slot-a', members[0].id)

      const late = await confirm(opportunity.id, 'slot-b', members[1].id)

      expect(late).toEqual({ outcome: 'already_covered', covered_by: 'Member0' })
      expect(await visitsFor(opportunity.id)).toHaveLength(1)
      expect((await opportunityRow(opportunity.id)).accepted_by).toBe(members[0].id)
    })

    it('can try the same moment at once: exactly one wins, the rest are told it is covered', async () => {
      const { members, opportunity } = await createProposedOpportunity(8)

      const results = await Promise.all(
        members.map((m, i) => confirm(opportunity.id, SLOTS[i % SLOTS.length].id, m.id)),
      )

      const winners = results.filter((r) => r.outcome === 'confirmed')
      expect(winners).toHaveLength(1)
      expect(results.filter((r) => r.outcome === 'already_covered')).toHaveLength(7)

      const visits = await visitsFor(opportunity.id)
      expect(visits).toHaveLength(1)
      expect(visits[0].id).toBe(winners[0].visit_id)
      expect((await opportunityRow(opportunity.id)).accepted_by).toBe(visits[0].member_id)
      // Everyone who lost is told the same winner.
      const names = new Set(results.filter((r) => r.outcome === 'already_covered').map((r) => r.covered_by))
      expect(names.size).toBe(1)
    })
  })

  describe('the same member confirming again', () => {
    it('is safe to retry: same slot returns the same visit and makes no duplicate', async () => {
      const { members, opportunity } = await createProposedOpportunity()
      const first = await confirm(opportunity.id, 'slot-a', members[0].id)

      const again = await confirm(opportunity.id, 'slot-a', members[0].id)

      expect(again).toEqual({ outcome: 'confirmed', visit_id: first.visit_id })
      expect(await visitsFor(opportunity.id)).toHaveLength(1)
    })

    it('cannot switch to another slot this way (that would be changing a booking)', async () => {
      const { members, opportunity } = await createProposedOpportunity()
      await confirm(opportunity.id, 'slot-a', members[0].id)

      const switched = await confirm(opportunity.id, 'slot-b', members[0].id)

      expect(switched.outcome).toBe('already_covered')
      expect((await visitsFor(opportunity.id))[0].starts_at).toContain('2026-10-15')
    })
  })

  describe('refusals leave everything unchanged', () => {
    async function expectUntouched(opportunityId: unknown) {
      expect(await visitsFor(opportunityId)).toHaveLength(0)
      expect(await opportunityRow(opportunityId)).toMatchObject({ accepted_by: null })
    }

    it.each(['detected', 'declined', 'expired'])('will not confirm a %s opportunity', async (status) => {
      const { members, opportunity } = await createProposedOpportunity(2, { status })

      const result = await confirm(opportunity.id, 'slot-a', members[0].id)

      expect(result.outcome).toBe('not_open')
      expect((await opportunityRow(opportunity.id)).status).toBe(status)
      await expectUntouched(opportunity.id)
    })

    it('will not confirm a slot that was never offered', async () => {
      const { members, opportunity } = await createProposedOpportunity()

      const result = await confirm(opportunity.id, 'slot-zzz', members[0].id)

      expect(result.outcome).toBe('slot_not_found')
      expect((await opportunityRow(opportunity.id)).status).toBe('proposed')
      await expectUntouched(opportunity.id)
    })

    it('will not let a member of a different family confirm', async () => {
      const { opportunity } = await createProposedOpportunity()
      const stranger = await createFamilyMember((await createSenior()).id as string)

      const result = await confirm(opportunity.id, 'slot-a', stranger.id)

      expect(result.outcome).toBe('not_family')
      expect((await opportunityRow(opportunity.id)).status).toBe('proposed')
      await expectUntouched(opportunity.id)
    })

    it('says not_found for an opportunity that does not exist', async () => {
      const { members } = await createProposedOpportunity()
      const result = await confirm('00000000-0000-4000-8000-000000000000', 'slot-a', members[0].id)
      expect(result.outcome).toBe('not_found')
    })

    it('says not_family for a member that does not exist', async () => {
      const { opportunity } = await createProposedOpportunity()
      const result = await confirm(opportunity.id, 'slot-a', '00000000-0000-4000-8000-000000000000')
      expect(result.outcome).toBe('not_family')
      await expectUntouched(opportunity.id)
    })
  })

  it('cannot be called with the anon key: only the server may confirm', async () => {
    const { members, opportunity } = await createProposedOpportunity()

    const { error } = await anonClient().rpc('confirm_opportunity_slot', {
      p_opportunity_id: opportunity.id,
      p_slot_id: 'slot-a',
      p_member_id: members[0].id,
    })

    expect(error?.code).toBe('42501') // permission denied
    expect((await opportunityRow(opportunity.id)).status).toBe('proposed')
  })
})
