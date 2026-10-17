import { describe, expect, it } from 'vitest'
import { loadOpportunity } from '@/lib/load-opportunity'

// Reads what /opportunities/[id] shows: the opportunity, the family's names (to say who claimed it)
// and the elder's timezone (to print slot times). Supabase is faked, routed by table.

const SENIOR = 'senior-1'
const opportunity = {
  id: 'opp-1',
  senior_id: SENIOR,
  type: 'gift_errand',
  summary: 'Has extra zucchini',
  quote: 'My zucchini are out of control.',
  mentioned_item: 'zucchini',
  urgency: 'normal',
  status: 'proposed',
  accepted_by: null,
  proposed_slots: [{ id: 'slot-a', starts_at: '2026-10-15T20:00:00Z' }],
}

type Result = { data: unknown; error: { message: string } | null }

function fakeDb(tables: { opportunities?: Result; seniors?: Result; family_members?: Result }) {
  const queries: { table: string; column?: string; value?: unknown }[] = []
  const db = {
    from: (table: keyof typeof tables) => {
      const result = tables[table] ?? { data: null, error: null }
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          queries.push({ table, column, value })
          return chain
        },
        maybeSingle: async () => result,
        // family_members is a list, so it is awaited directly after eq().
        then: (resolve: (r: Result) => unknown) => resolve(result),
      }
      return chain
    },
  }
  return { db: db as never, queries }
}

const ok = (data: unknown): Result => ({ data, error: null })
const happy = () =>
  fakeDb({
    opportunities: ok(opportunity),
    seniors: ok({ timezone: 'America/Toronto' }),
    family_members: ok([{ id: 'm1', name: 'Danny' }, { id: 'm2', name: 'Maya' }]),
  })

describe('loadOpportunity', () => {
  it('returns the opportunity, the family names and the timezone', async () => {
    const { db } = happy()

    const loaded = await loadOpportunity(db, 'opp-1')

    expect(loaded).toEqual({
      opportunity,
      members: [{ id: 'm1', name: 'Danny' }, { id: 'm2', name: 'Maya' }],
      timezone: 'America/Toronto',
    })
  })

  it('looks the opportunity up by id, and the family and timezone by the opportunity\'s senior', async () => {
    const { db, queries } = happy()

    await loadOpportunity(db, 'opp-1')

    expect(queries).toContainEqual({ table: 'opportunities', column: 'id', value: 'opp-1' })
    expect(queries).toContainEqual({ table: 'seniors', column: 'id', value: SENIOR })
    expect(queries).toContainEqual({ table: 'family_members', column: 'senior_id', value: SENIOR })
  })

  it('returns null, not an error, when there is no such opportunity', async () => {
    const { db, queries } = fakeDb({ opportunities: ok(null) })

    await expect(loadOpportunity(db, 'nope')).resolves.toBeNull()
    expect(queries.map((q) => q.table)).toEqual(['opportunities']) // no further lookups
  })

  it('falls back to UTC if the senior has no timezone on file', async () => {
    const { db } = fakeDb({
      opportunities: ok(opportunity),
      seniors: ok(null),
      family_members: ok([]),
    })

    expect((await loadOpportunity(db, 'opp-1'))?.timezone).toBe('UTC')
  })

  it('treats a missing family list as empty', async () => {
    const { db } = fakeDb({ opportunities: ok(opportunity), seniors: ok({ timezone: 'UTC' }), family_members: ok(null) })
    expect((await loadOpportunity(db, 'opp-1'))?.members).toEqual([])
  })

  it.each(['opportunities', 'seniors', 'family_members'] as const)(
    'throws a generic error when the %s lookup fails',
    async (table) => {
      const tables = {
        opportunities: ok(opportunity),
        seniors: ok({ timezone: 'UTC' }),
        family_members: ok([]),
        [table]: { data: null, error: { message: 'connection refused near secret-detail' } },
      }
      const { db } = fakeDb(tables)

      const failure = await loadOpportunity(db, 'opp-1').catch((e: Error) => e)

      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).toMatch(/load/i)
      expect((failure as Error).message).not.toContain('secret-detail')
    },
  )
})
