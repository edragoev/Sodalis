import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient, anonClient } from '../helpers/supabase'
import { createFamilyMember, createSenior } from '../helpers/factories'

describe.skipIf(!hasTestDb())('family_members profile columns', () => {
  it('start empty, so a member with no profile is still valid', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string)
    expect(member).toMatchObject({
      interests: [],
      skills: [],
      activities_with_elder: [],
      conversation_topics: [],
      constraints: {},
      profile_summary: null,
    })
  })

  it('store the seeded tags, constraints and summary', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string, {
      name: 'Danny',
      interests: ['cooking'],
      skills: ['driving'],
      activities_with_elder: ['cooking', 'gardening'],
      conversation_topics: ['recipes'],
      constraints: { can_drive: true, travel_minutes: 20 },
      profile_summary: 'Loves cooking with the elder.',
      manual_availability: { sat: [{ start: '14:00', end: '18:00' }] },
    })
    expect(member.activities_with_elder).toEqual(['cooking', 'gardening'])
    expect(member.constraints).toEqual({ can_drive: true, travel_minutes: 20 })
  })
})

describe.skipIf(!hasTestDb())('family_members names', () => {
  it('are unique per elder, ignoring case', async () => {
    const senior = await createSenior()
    await createFamilyMember(senior.id as string, { name: 'Danny' })

    const { error } = await adminClient()
      .from('family_members')
      .insert({ senior_id: senior.id, name: 'danny' })
    expect(error?.code).toBe('23505')
  })

  it('may repeat across different elders', async () => {
    const a = await createSenior()
    const b = await createSenior()
    await createFamilyMember(a.id as string, { name: 'Danny' })
    await expect(createFamilyMember(b.id as string, { name: 'Danny' })).resolves.toBeTruthy()
  })
})

describe.skipIf(!hasTestDb())('family_members secrets', () => {
  // The dashboard reads with the anon key, so anything anon can SELECT is public.
  it('anon can read the safe columns', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string, { name: 'Danny' })
    const { data, error } = await anonClient()
      .from('family_members')
      .select('id, name, relationship, interests, profile_summary')
      .eq('id', member.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it.each(['fcm_token', 'google_refresh_token'])('anon cannot read %s', async (column) => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string, {
      name: 'Danny',
      fcm_token: 'secret-token',
      google_refresh_token: 'secret-refresh',
    })
    const { data, error } = await anonClient().from('family_members').select(column).eq('id', member.id)
    expect(error?.code).toBe('42501') // permission denied
    expect(data).toBeNull()
  })

  it('anon cannot get the secrets through select(*) either', async () => {
    const senior = await createSenior()
    await createFamilyMember(senior.id as string, { name: 'Danny', fcm_token: 'secret-token' })
    const { data } = await anonClient().from('family_members').select('*').eq('senior_id', senior.id)
    expect(JSON.stringify(data ?? [])).not.toContain('secret-token')
  })

  it('the service role still reads and writes them', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string, { name: 'Danny', fcm_token: 'tok' })
    const { data } = await adminClient().from('family_members').select('fcm_token').eq('id', member.id).single()
    expect(data?.fcm_token).toBe('tok')
  })
})
