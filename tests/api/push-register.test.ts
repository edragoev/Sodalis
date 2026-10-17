import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { getTestEnv, hasTestDb } from '../helpers/env'
import { callRoute } from '../helpers/route'
import { adminClient, anonClient } from '../helpers/supabase'
import { createFamilyMember, createSenior } from '../helpers/factories'

// POST /api/push/register stores a member's FCM token (specs/02-api/routes.md).
// Real database: the route runs against the test Supabase, not a mock.

beforeAll(() => {
  if (!hasTestDb()) return
  // The route builds its service-role client from these.
  const env = getTestEnv()
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey
})

// Loaded per call so a missing route fails each test clearly instead of breaking the whole file.
async function register(body: unknown) {
  const { POST } = await import('@/app/api/push/register/route')
  return callRoute(POST, '/api/push/register', { body })
}

async function storedToken(memberId: string) {
  const { data, error } = await adminClient()
    .from('family_members')
    .select('fcm_token')
    .eq('id', memberId)
    .single()
  expect(error).toBeNull()
  return data?.fcm_token as string | null
}

describe.skipIf(!hasTestDb())('POST /api/push/register', () => {
  it('saves the token on that member and returns 200', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string)
    const other = await createFamilyMember(senior.id as string)

    const res = await register({ member_id: member.id, token: 'fcm-token-abc' })

    expect(res.status).toBe(200)
    expect(await storedToken(member.id as string)).toBe('fcm-token-abc')
    expect(await storedToken(other.id as string)).toBeNull() // only the named member
  })

  describe('validation (400 Bad Request)', () => {
    it.each([
      ['token is missing', { member_id: randomUUID() }],
      ['token is empty', { member_id: randomUUID(), token: '' }],
      ['token is only whitespace', { member_id: randomUUID(), token: '   ' }],
      ['token is not a string', { member_id: randomUUID(), token: 12345 }],
      ['member_id is missing', { token: 'fcm-token-abc' }],
      ['member_id is not a UUID', { member_id: 'not-a-uuid', token: 'fcm-token-abc' }],
    ])('rejects a request when %s', async (_name, body) => {
      const res = await register(body)
      expect(res.status).toBe(400)
      expect(res.json.error).toEqual(expect.any(String))
    })
  })

  it('returns 404, not 500, for a member that does not exist', async () => {
    const res = await register({ member_id: randomUUID(), token: 'fcm-token-abc' })
    expect(res.status).toBe(404)
  })

  it('replaces the old token when the member registers again', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string, { fcm_token: 'old-token' })

    const res = await register({ member_id: member.id, token: 'new-token' })

    expect(res.status).toBe(200)
    expect(await storedToken(member.id as string)).toBe('new-token')
  })

  it('never exposes the token, in the response or to the anon key', async () => {
    const senior = await createSenior()
    const member = await createFamilyMember(senior.id as string)

    const res = await register({ member_id: member.id, token: 'secret-fcm-token' })

    expect(res.status).toBe(200)
    expect(JSON.stringify(res.json)).not.toContain('secret-fcm-token')

    // The dashboard reads with the anon key; the column must stay unreadable.
    const { error } = await anonClient().from('family_members').select('fcm_token').eq('id', member.id)
    expect(error?.code).toBe('42501') // permission denied
  })
})
