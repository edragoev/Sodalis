import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient, anonClient } from '../helpers/supabase'
import { createCheckIn, createFamilyMember, createOpportunity, createSenior, testPhone } from '../helpers/factories'

// No auth in the demo: the dashboard reads with the anon key and every write goes
// through the service role. So anon must be able to read and must not be able to write.
const PERMISSION_DENIED = '42501'

const fixtures = async () => {
  const senior = await createSenior()
  const seniorId = senior.id as string
  const member = await createFamilyMember(seniorId)
  const checkIn = await createCheckIn(seniorId)
  const opportunity = await createOpportunity(seniorId, checkIn.id as string)
  return { seniorId, member, checkIn, opportunity }
}

// A minimal valid insert and a harmless update per table.
const tables = (f: Awaited<ReturnType<typeof fixtures>>) => ({
  seniors: {
    id: f.seniorId,
    insert: { name: 'Anon', phone_e164: testPhone() },
    update: { name: 'Hacked' },
  },
  family_members: {
    id: f.member.id as string,
    insert: { senior_id: f.seniorId, name: 'Anon Member' },
    update: { name: 'Hacked' },
  },
  check_ins: {
    id: f.checkIn.id as string,
    insert: { senior_id: f.seniorId, vapi_call_id: 'anon-call', started_at: new Date().toISOString() },
    update: { summary: 'Hacked' },
  },
  opportunities: {
    id: f.opportunity.id as string,
    insert: { senior_id: f.seniorId, check_in_id: f.checkIn.id, type: 'activity', summary: 'Anon' },
    update: { summary: 'Hacked' },
  },
})

const TABLE_NAMES = ['seniors', 'family_members', 'check_ins', 'opportunities'] as const

describe.skipIf(!hasTestDb())('RLS: the anon key is read-only', () => {
  it.each(TABLE_NAMES)('anon can SELECT from %s', async (table) => {
    const f = await fixtures()
    const { id } = tables(f)[table]

    const { data, error } = await anonClient().from(table).select('id').eq('id', id)

    expect(error).toBeNull()
    expect(data).toEqual([{ id }])
  })

  it.each(TABLE_NAMES)('anon cannot INSERT into %s', async (table) => {
    const f = await fixtures()
    const { error } = await anonClient().from(table).insert(tables(f)[table].insert)
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it.each(TABLE_NAMES)('anon cannot UPDATE %s', async (table) => {
    const f = await fixtures()
    const t = tables(f)[table]

    const { error } = await anonClient().from(table).update(t.update).eq('id', t.id)

    expect(error?.code).toBe(PERMISSION_DENIED)
    // And the row really is unchanged.
    const { data } = await adminClient().from(table).select('*').eq('id', t.id).single()
    expect(JSON.stringify(data)).not.toContain('Hacked')
  })

  it.each(TABLE_NAMES)('anon cannot DELETE from %s', async (table) => {
    const f = await fixtures()
    const { id } = tables(f)[table]

    const { error } = await anonClient().from(table).delete().eq('id', id)

    expect(error?.code).toBe(PERMISSION_DENIED)
    const { data } = await adminClient().from(table).select('id').eq('id', id)
    expect(data).toHaveLength(1)
  })

  it('the service role can still write (the API routes depend on it)', async () => {
    const f = await fixtures()
    const { error } = await adminClient().from('seniors').update({ name: 'Renamed' }).eq('id', f.seniorId)
    expect(error).toBeNull()
  })
})
