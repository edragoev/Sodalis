import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient } from '../helpers/supabase'
import { createCheckIn, createSenior, testPhone } from '../helpers/factories'
import { findSeniorByPhone, linkHopeOpportunities } from '@/lib/vapi/store'

// The two database lookups the Vapi webhook needs. Real database.

const db = () => adminClient()

/**
 * An opportunity as Hope's propose_visit tool creates it: tied to a call, with no check-in yet.
 * A call can have only one per type and member, so tests that need two give them different types.
 */
async function hopeOpportunity(seniorId: string, callId: string, over: Record<string, unknown> = {}) {
  const { data, error } = await db()
    .from('opportunities')
    .insert({
      senior_id: seniorId,
      check_in_vapi_call_id: callId,
      source: 'hope_tool',
      type: 'gift_errand',
      summary: 'Has extra zucchini',
      status: 'detected',
      ...over,
    })
    .select()
    .single()
  expect(error).toBeNull()
  return data as Record<string, any>
}

const row = async (id: string) =>
  (await db().from('opportunities').select('check_in_id, status').eq('id', id).single()).data as {
    check_in_id: string | null
    status: string
  }

describe.skipIf(!hasTestDb())('findSeniorByPhone', () => {
  it('finds the senior with that phone number', async () => {
    const phone = testPhone()
    const senior = await createSenior({ phone_e164: phone })
    await expect(findSeniorByPhone(db(), phone)).resolves.toEqual({ id: senior.id })
  })

  it('returns null for a number nobody has', async () => {
    await expect(findSeniorByPhone(db(), testPhone())).resolves.toBeNull()
  })

  it('does not match a number that merely starts the same', async () => {
    const phone = testPhone()
    await createSenior({ phone_e164: phone })
    await expect(findSeniorByPhone(db(), phone.slice(0, -1))).resolves.toBeNull()
  })

  it('throws a generic error when the lookup fails', async () => {
    const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'secret detail' } }) }) }) }) }
    const failure = await findSeniorByPhone(broken as never, '+15550100001').catch((e: Error) => e)
    expect((failure as Error).message).not.toContain('secret detail')
  })
})

describe.skipIf(!hasTestDb())('linkHopeOpportunities', () => {
  it('attaches the call\'s opportunities to the check-in, and returns the ones ready to propose', async () => {
    const senior = await createSenior()
    const checkIn = await createCheckIn(senior.id as string, { vapi_call_id: 'call-link-1' })
    const a = await hopeOpportunity(senior.id as string, 'call-link-1', { type: 'gift_errand' })
    const b = await hopeOpportunity(senior.id as string, 'call-link-1', { type: 'activity' })

    const ready = await linkHopeOpportunities(db(), 'call-link-1', checkIn.id as string)

    expect([...ready].sort()).toEqual([a.id, b.id].sort())
    expect((await row(a.id)).check_in_id).toBe(checkIn.id)
    expect((await row(b.id)).check_in_id).toBe(checkIn.id)
  })

  it('leaves other calls\' opportunities alone', async () => {
    const senior = await createSenior()
    const checkIn = await createCheckIn(senior.id as string, { vapi_call_id: 'call-link-2' })
    const other = await hopeOpportunity(senior.id as string, 'some-other-call')

    const ready = await linkHopeOpportunities(db(), 'call-link-2', checkIn.id as string)

    expect(ready).toEqual([])
    expect((await row(other.id)).check_in_id).toBeNull()
  })

  it('links, but does not return, an opportunity Hope was unsure about (confidence below 0.6)', async () => {
    const senior = await createSenior()
    const checkIn = await createCheckIn(senior.id as string, { vapi_call_id: 'call-link-3' })
    const unsure = await hopeOpportunity(senior.id as string, 'call-link-3', { type: 'gift_errand', confidence: 0.4 })
    const sure = await hopeOpportunity(senior.id as string, 'call-link-3', { type: 'activity', confidence: 0.6 })

    const ready = await linkHopeOpportunities(db(), 'call-link-3', checkIn.id as string)

    expect(ready).toEqual([sure.id])
    expect((await row(unsure.id)).check_in_id).toBe(checkIn.id) // kept for the dashboard
  })

  it('treats an opportunity with no confidence score as ready, because Hope\'s tool does not give one', async () => {
    const senior = await createSenior()
    const checkIn = await createCheckIn(senior.id as string, { vapi_call_id: 'call-link-4' })
    const opp = await hopeOpportunity(senior.id as string, 'call-link-4', { confidence: null })

    await expect(linkHopeOpportunities(db(), 'call-link-4', checkIn.id as string)).resolves.toEqual([opp.id])
  })

  it.each(['proposed', 'confirmed', 'declined', 'expired'])(
    'does not return a %s opportunity, so it is never proposed twice',
    async (status) => {
      const senior = await createSenior()
      const checkIn = await createCheckIn(senior.id as string, { vapi_call_id: `call-link-${status}` })
      const opp = await hopeOpportunity(senior.id as string, `call-link-${status}`, { status })

      const ready = await linkHopeOpportunities(db(), `call-link-${status}`, checkIn.id as string)

      expect(ready).toEqual([])
      expect((await row(opp.id)).status).toBe(status) // untouched
    },
  )

  it('does not move an opportunity that already belongs to a check-in', async () => {
    const senior = await createSenior()
    const first = await createCheckIn(senior.id as string, { vapi_call_id: 'call-link-5' })
    const second = await createCheckIn(senior.id as string)
    const opp = await hopeOpportunity(senior.id as string, 'call-link-5', { check_in_id: first.id })

    const ready = await linkHopeOpportunities(db(), 'call-link-5', second.id as string)

    expect(ready).toEqual([])
    expect((await row(opp.id)).check_in_id).toBe(first.id)
  })

  it('is safe to run twice: the second run changes nothing and returns nothing', async () => {
    const senior = await createSenior()
    const checkIn = await createCheckIn(senior.id as string, { vapi_call_id: 'call-link-6' })
    await hopeOpportunity(senior.id as string, 'call-link-6')

    expect(await linkHopeOpportunities(db(), 'call-link-6', checkIn.id as string)).toHaveLength(1)
    expect(await linkHopeOpportunities(db(), 'call-link-6', checkIn.id as string)).toEqual([])
  })

  it('returns an empty list when the call had no opportunities', async () => {
    const senior = await createSenior()
    const checkIn = await createCheckIn(senior.id as string, { vapi_call_id: 'call-link-7' })
    await expect(linkHopeOpportunities(db(), 'call-link-7', checkIn.id as string)).resolves.toEqual([])
  })
})
