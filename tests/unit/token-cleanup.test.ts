import { describe, expect, it, vi } from 'vitest'
import { clearDeadTokens } from '@/lib/firebase/token-cleanup'

// Removes tokens Firebase said are dead from family_members.fcm_token. Supabase is faked:
// from('family_members').update(values).in(column, tokens).select('id') -> { data, error }.

type Call = { table: string; values: unknown; column: string; tokens: string[] }

function fakeDb(opts: { error?: { message: string }; rowsPerCall?: (tokens: string[]) => number } = {}) {
  const calls: Call[] = []
  const db = {
    from: (table: string) => ({
      update: (values: unknown) => ({
        in: (column: string, tokens: string[]) => {
          calls.push({ table, values, column, tokens })
          return {
            select: async () => ({
              data: opts.error ? null : Array.from({ length: opts.rowsPerCall?.(tokens) ?? tokens.length }, (_, i) => ({ id: `m${i}` })),
              error: opts.error ?? null,
            }),
          }
        },
      }),
    }),
  }
  return { db: db as never, calls }
}

describe('clearDeadTokens', () => {
  it('sets fcm_token to null on the members who hold those tokens', async () => {
    const { db, calls } = fakeDb()

    await clearDeadTokens(db, ['tok-a', 'tok-b'])

    expect(calls).toEqual([
      { table: 'family_members', values: { fcm_token: null }, column: 'fcm_token', tokens: ['tok-a', 'tok-b'] },
    ])
  })

  it('returns how many members were cleared', async () => {
    const { db } = fakeDb({ rowsPerCall: () => 2 })
    await expect(clearDeadTokens(db, ['tok-a', 'tok-b', 'tok-c'])).resolves.toBe(2)
  })

  it('does not touch the database when there is nothing to clear', async () => {
    const { db, calls } = fakeDb()
    await expect(clearDeadTokens(db, [])).resolves.toBe(0)
    expect(calls).toEqual([])
  })

  it('ignores blank tokens, so an empty string can never match every empty column', async () => {
    const { db, calls } = fakeDb()

    await clearDeadTokens(db, ['', '   ', 'tok-a'])

    expect(calls.map((c) => c.tokens)).toEqual([['tok-a']])
  })

  it('does not touch the database when every token is blank', async () => {
    const { db, calls } = fakeDb()
    await expect(clearDeadTokens(db, ['', '  '])).resolves.toBe(0)
    expect(calls).toEqual([])
  })

  it('sends each distinct token once', async () => {
    const { db, calls } = fakeDb()
    await clearDeadTokens(db, ['tok-a', 'tok-b', 'tok-a'])
    expect(calls[0].tokens).toEqual(['tok-a', 'tok-b'])
  })

  it('splits a long list into batches of 200 and adds up the counts', async () => {
    const { db, calls } = fakeDb()
    const tokens = Array.from({ length: 450 }, (_, i) => `tok-${i}`)

    const cleared = await clearDeadTokens(db, tokens)

    expect(calls.map((c) => c.tokens.length)).toEqual([200, 200, 50])
    expect(cleared).toBe(450)
  })

  it('throws a generic error when the database fails, without leaking tokens', async () => {
    const { db } = fakeDb({ error: { message: 'connection refused near tok-secret' } })

    const failure = await clearDeadTokens(db, ['tok-secret']).catch((e: Error) => e)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toMatch(/clear/i)
    expect((failure as Error).message).not.toContain('tok-secret')
  })
})
