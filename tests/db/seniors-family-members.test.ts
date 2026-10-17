import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient } from '../helpers/supabase'
import { createFamilyMember, createSenior, testPhone } from '../helpers/factories'

describe.skipIf(!hasTestDb())('seniors and family_members', () => {
  it('rejects a second senior with the same phone_e164', async () => {
    const first = await createSenior()

    const { error } = await adminClient()
      .from('seniors')
      .insert({ name: 'Duplicate', phone_e164: first.phone_e164, timezone: 'UTC' })

    expect(error?.code).toBe('23505') // unique_violation
  })

  it('allows different seniors to have different phone numbers', async () => {
    await createSenior({ phone_e164: testPhone() })
    const { error } = await adminClient()
      .from('seniors')
      .insert({ name: 'Another', phone_e164: '+15550109999', timezone: 'UTC' })
    expect(error).toBeNull()
  })

  it('deleting a senior cascades to their family members', async () => {
    const senior = await createSenior()
    const other = await createSenior()
    await createFamilyMember(senior.id as string)
    await createFamilyMember(senior.id as string)
    const bystander = await createFamilyMember(other.id as string)

    const { error: deleteError } = await adminClient().from('seniors').delete().eq('id', senior.id)
    expect(deleteError).toBeNull()

    const { count: gone } = await adminClient()
      .from('family_members')
      .select('id', { count: 'exact', head: true })
      .eq('senior_id', senior.id)
    expect(gone).toBe(0)

    // Another senior's family is untouched.
    const { data: kept } = await adminClient().from('family_members').select('id').eq('id', bystander.id)
    expect(kept).toHaveLength(1)
  })
})
