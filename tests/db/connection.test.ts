import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient, anonClient } from '../helpers/supabase'
import { createCheckIn, createFamilyMember, createOpportunity, createSenior } from '../helpers/factories'

// These need a running test database and the schema migration applied.
describe.skipIf(!hasTestDb())('test database', () => {
  it('connects with the service-role client', async () => {
    const { error } = await adminClient().from('seniors').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('connects with the anon client (RLS applies)', async () => {
    const { error } = await anonClient().from('seniors').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('creates linked rows through the factories', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string)
    const checkIn = await createCheckIn(senior.id as string)
    const opp = await createOpportunity(senior.id as string, checkIn.id as string)
    expect(member.senior_id).toBe(senior.id)
    expect(opp.check_in_id).toBe(checkIn.id)
  })

  it('cleaned up the previous test (nothing left behind)', async () => {
    const { count } = await adminClient()
      .from('seniors')
      .select('id', { count: 'exact', head: true })
      .like('phone_e164', '+1555010%')
    expect(count).toBe(0)
  })
})
