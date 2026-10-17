import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient } from '../helpers/supabase'
import { createFamilyMember, createSenior } from '../helpers/factories'

describe.skipIf(!hasTestDb())('family_members.pronouns', () => {
  it('defaults to null when the member has not set pronouns', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string)
    expect(member.pronouns).toBeNull()
  })

  it('stores free-text pronouns exactly as given', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string, { pronouns: 'she/her' })
    expect(member.pronouns).toBe('she/her')

    const custom = await createFamilyMember(senior.id as string, { pronouns: 'xe/xem' })
    expect(custom.pronouns).toBe('xe/xem')
  })

  it('can be updated and cleared back to null', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string, { pronouns: 'he/him' })

    const { data: updated, error } = await adminClient()
      .from('family_members')
      .update({ pronouns: 'they/them' })
      .eq('id', member.id)
      .select('pronouns')
      .single()
    expect(error).toBeNull()
    expect(updated?.pronouns).toBe('they/them')

    const { data: cleared } = await adminClient()
      .from('family_members')
      .update({ pronouns: null })
      .eq('id', member.id)
      .select('pronouns')
      .single()
    expect(cleared?.pronouns).toBeNull()
  })

  it('does not change another member\'s pronouns', async () => {
    const senior = await createSenior()
    const a = await createFamilyMember(senior.id as string, { pronouns: 'she/her' })
    const b = await createFamilyMember(senior.id as string, { pronouns: 'he/him' })

    await adminClient().from('family_members').update({ pronouns: 'they/them' }).eq('id', a.id)

    const { data } = await adminClient().from('family_members').select('pronouns').eq('id', b.id).single()
    expect(data?.pronouns).toBe('he/him')
  })

  it('is readable by the anon dashboard client like other member columns', async () => {
    const { anonClient } = await import('../helpers/supabase')
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string, { pronouns: 'she/her' })

    const { data, error } = await anonClient().from('family_members').select('pronouns').eq('id', member.id)
    expect(error).toBeNull()
    expect(data).toEqual([{ pronouns: 'she/her' }])
  })
})
