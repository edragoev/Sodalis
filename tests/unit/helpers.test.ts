import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { getTestEnv } from '../helpers/env'
import { callRoute } from '../helpers/route'
import { cleanupAllTestData, cleanupTracked, track, TEST_PHONE_PREFIX } from '../helpers/cleanup'

describe('getTestEnv', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    process.env.TEST_SUPABASE_ANON_KEY = 'anon'
    process.env.TEST_SUPABASE_SERVICE_ROLE_KEY = 'service'
    delete process.env.ALLOW_REMOTE_TEST_DB
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it('accepts a local URL', () => {
    process.env.TEST_SUPABASE_URL = 'http://127.0.0.1:54321'
    expect(getTestEnv().url).toBe('http://127.0.0.1:54321')
  })

  it('refuses a remote URL by default', () => {
    process.env.TEST_SUPABASE_URL = 'https://abcd.supabase.co'
    expect(() => getTestEnv()).toThrow(/non-local/)
  })

  it('allows a remote URL only with the explicit flag', () => {
    process.env.TEST_SUPABASE_URL = 'https://abcd.supabase.co'
    process.env.ALLOW_REMOTE_TEST_DB = 'true'
    expect(getTestEnv().url).toContain('supabase.co')
  })

  it('throws a helpful error when variables are missing', () => {
    delete process.env.TEST_SUPABASE_URL
    expect(() => getTestEnv()).toThrow(/\.env\.test\.example/)
  })
})

describe('callRoute', () => {
  it('passes body, query and params to the handler and parses JSON', async () => {
    const handler = vi.fn(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
      const { id } = await ctx.params
      return Response.json({ id, q: new URL(req.url).searchParams.get('x'), body: await req.json() }, { status: 201 })
    })
    const res = await callRoute(handler, '/api/members/abc/profile', {
      body: { a: 1 },
      params: { id: 'abc' },
      query: { x: 'y' },
    })
    expect(res.status).toBe(201)
    expect(res.json).toEqual({ id: 'abc', q: 'y', body: { a: 1 } })
  })

  it('returns plain text when the response is not JSON', async () => {
    const res = await callRoute(() => new Response('nope', { status: 401 }), '/api/x')
    expect(res.status).toBe(401)
    expect(res.json).toBe('nope')
  })
})

describe('cleanupTracked', () => {
  /** A fake client that records every delete in order. */
  function fakeDb() {
    const calls: string[] = []
    const db = {
      from(table: string) {
        return {
          select: () => ({
            in: async () => ({ data: [{ id: 'm1' }], error: null }),
          }),
          delete: () => ({
            in: async (column: string) => {
              calls.push(`${table}.${column}`)
              return { error: null }
            },
          }),
        }
      },
    }
    return { db: db as never, calls }
  }

  it('deletes children before seniors', async () => {
    const { db, calls } = fakeDb()
    track('seniors', 's1')
    await cleanupTracked(db)
    expect(calls[0]).toBe('member_profile_answers.member_id')
    expect(calls.indexOf('opportunities.senior_id')).toBeLessThan(calls.indexOf('check_ins.senior_id'))
    expect(calls.indexOf('visits.senior_id')).toBeLessThan(calls.indexOf('family_members.senior_id'))
    expect(calls.at(-1)).toBe('seniors.id')
  })

  it('does nothing when nothing was tracked', async () => {
    const { db, calls } = fakeDb()
    await cleanupTracked(db)
    expect(calls).toEqual([])
  })

  it('uses a reserved fictional phone prefix', () => {
    expect(TEST_PHONE_PREFIX).toBe('+1555010')
  })

  it('skips cleanup when the test database is unreachable', async () => {
    const unreachableDb = {
      from: () => ({
        select: () => ({
          like: async () => ({ data: null, error: { code: 'ECONNREFUSED', message: 'fetch failed' } }),
        }),
      }),
    } as never

    await expect(cleanupAllTestData(unreachableDb)).resolves.toBeUndefined()
  })
})
