import { describe, expect, it } from 'vitest'
import { createCoordinatorStore } from '@/lib/coordinator/store'

// The coordinator's reads and writes against Supabase, on an in-memory fake that records every write.

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>, failing: string[] = []) {
  const writes: { table: string; op: 'update' | 'insert'; values: Row; filters: [string, unknown][] }[] = []

  function query(table: string, op: 'select' | 'update', values?: Row) {
    const filters: [string, unknown][] = []
    const run = () => {
      if (failing.includes(table)) return { data: null, error: { message: `connection refused to 10.0.0.5 (${table})` } }
      const rows = (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
      if (op === 'update') {
        rows.forEach((r) => Object.assign(r, values))
        writes.push({ table, op, values: values!, filters })
      }
      return { data: rows, error: null }
    }
    const q = {
      eq: (column: string, value: unknown) => (filters.push([column, value]), q),
      select: () => q,
      maybeSingle: async () => {
        const r = run()
        return r.error ? r : { data: r.data![0] ?? null, error: null }
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    return q
  }

  const db = {
    from: (table: string) => ({
      select: () => query(table, 'select'),
      update: (values: Row) => query(table, 'update', values),
      insert: async (values: Row) => {
        writes.push({ table, op: 'insert', values, filters: [] })
        return failing.includes(table) ? { error: { message: `connection refused to 10.0.0.5 (${table})` } } : { error: null }
      },
    }),
  }
  return { db: db as never, writes, tables }
}

const opportunityRow = (over: Row = {}): Row => ({
  id: 'opp-1',
  senior_id: 'senior-1',
  type: 'gift_errand',
  summary: 'Has extra zucchini',
  quote: 'My zucchini are out of control.',
  mentioned_member_id: 'danny',
  mentioned_item: 'zucchini',
  interest_tags: ['gardening', 'cooking'],
  target_date: null,
  urgency: 'normal',
  status: 'detected',
  notified_member_ids: [],
  proposed_slots: [],
  ...over,
})

const memberRow = (id: string, over: Row = {}): Row => ({
  id,
  senior_id: 'senior-1',
  name: id,
  relationship: 'grandchild',
  interests: ['cooking'],
  skills: [],
  activities_with_elder: [],
  conversation_topics: [],
  constraints: {},
  profile_summary: null,
  fcm_token: 'secret-token',
  google_refresh_token: 'secret-refresh',
  ...over,
})

const seed = () => ({
  opportunities: [opportunityRow()],
  seniors: [{ id: 'senior-1', name: 'Rose Chen', timezone: 'America/Toronto' }],
  family_members: [memberRow('danny'), memberRow('maya'), memberRow('stranger', { senior_id: 'senior-2' })],
  agent_runs: [],
})

describe('loadContext', () => {
  it('returns the opportunity, the elder\'s first name and timezone, and only that family', async () => {
    const { db } = fakeDb(seed())
    const context = await createCoordinatorStore(db).loadContext('opp-1')

    expect(context).not.toBeNull()
    expect(context!.opportunity).toMatchObject({
      id: 'opp-1',
      senior_id: 'senior-1',
      type: 'gift_errand',
      quote: 'My zucchini are out of control.',
      mentioned_member_id: 'danny',
      mentioned_item: 'zucchini',
      interest_tags: ['gardening', 'cooking'],
      target_date: null,
      urgency: 'normal',
      status: 'detected',
    })
    expect(context!.senior).toEqual({ first_name: 'Rose', timezone: 'America/Toronto' })
    expect(context!.members.map((m) => m.id)).toEqual(['danny', 'maya'])
  })

  it('never lets a push token or refresh token reach the coordinator, which sends members to Gemini', async () => {
    const { db } = fakeDb(seed())
    const context = await createCoordinatorStore(db).loadContext('opp-1')
    expect(JSON.stringify(context)).not.toMatch(/secret-token|secret-refresh|fcm_token|google_refresh_token/)
  })

  it('returns null for an opportunity that does not exist', async () => {
    const { db } = fakeDb(seed())
    expect(await createCoordinatorStore(db).loadContext('missing')).toBeNull()
  })

  it('uses UTC when the elder has no timezone, and a sensible name when there is none', async () => {
    const data = seed()
    data.seniors = [{ id: 'senior-1', name: '', timezone: null } as never]
    const { db } = fakeDb(data)
    const context = await createCoordinatorStore(db).loadContext('opp-1')
    expect(context!.senior.timezone).toBe('UTC')
    expect(context!.senior.first_name).not.toBe('')
  })

  it.each(['opportunities', 'seniors', 'family_members'])('throws, without leaking why, when %s cannot be read', async (table) => {
    const { db } = fakeDb(seed(), [table])
    const err = await createCoordinatorStore(db).loadContext('opp-1').catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toContain('10.0.0.5')
  })
})

describe('saveProposal', () => {
  const slots = [{ id: 'danny-1', starts_at: '2026-10-15T20:00:00.000Z', ends_at: '2026-10-15T22:00:00.000Z' }]

  it('stores the slots and the notified members and marks the opportunity proposed', async () => {
    const { db, tables } = fakeDb(seed())

    await createCoordinatorStore(db).saveProposal('opp-1', { notified_member_ids: ['danny'], proposed_slots: slots })

    expect(tables.opportunities[0]).toMatchObject({
      status: 'proposed',
      notified_member_ids: ['danny'],
      proposed_slots: slots,
    })
  })

  it('only changes an opportunity that is still detected, so two runs cannot both win', async () => {
    const { db, writes } = fakeDb(seed())
    await createCoordinatorStore(db).saveProposal('opp-1', { notified_member_ids: ['danny'], proposed_slots: slots })
    expect(writes[0].filters).toEqual(expect.arrayContaining([['id', 'opp-1'], ['status', 'detected']]))
  })

  it('throws when the opportunity was already proposed, so the caller does not push twice', async () => {
    const data = seed()
    data.opportunities = [opportunityRow({ status: 'proposed' })]
    const { db, tables } = fakeDb(data)

    await expect(
      createCoordinatorStore(db).saveProposal('opp-1', { notified_member_ids: ['maya'], proposed_slots: slots }),
    ).rejects.toThrow()
    expect(tables.opportunities[0].notified_member_ids).toEqual([])
  })

  it('throws, without leaking why, when the write fails', async () => {
    const { db } = fakeDb(seed(), ['opportunities'])
    const err = await createCoordinatorStore(db)
      .saveProposal('opp-1', { notified_member_ids: ['danny'], proposed_slots: slots })
      .catch((e: Error) => e)
    expect((err as Error).message).not.toContain('10.0.0.5')
  })
})

describe('recordRun', () => {
  it('writes one agent_runs row with the input, the output and whether the template was used', async () => {
    const { db, writes } = fakeDb(seed())
    const input = { senior: { first_name: 'Rose' }, members: [] }
    const output = { member_id: 'danny', slot_ids: ['danny-1'], title: 't', body: 'b', why: 'w' }

    await createCoordinatorStore(db).recordRun({
      opportunity_id: 'opp-1',
      input: input as never,
      output,
      used_fallback: true,
      fallback_reason: 'timeout',
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ table: 'agent_runs', op: 'insert' })
    expect(writes[0].values).toMatchObject({
      opportunity_id: 'opp-1',
      tool: 'coordinate',
      used_fallback: true,
      args: input,
    })
    expect(JSON.stringify(writes[0].values.result)).toContain('timeout')
    expect(JSON.stringify(writes[0].values.result)).toContain('danny-1')
  })

  it('records a run that ended without a push (no_slots)', async () => {
    const { db, writes } = fakeDb(seed())
    await createCoordinatorStore(db).recordRun({ opportunity_id: 'opp-1', reason: 'no_slots' })
    expect(writes[0].values).toMatchObject({ opportunity_id: 'opp-1', used_fallback: false })
    expect(JSON.stringify(writes[0].values.result)).toContain('no_slots')
  })

  it('throws when the row cannot be written, so the caller can log it', async () => {
    const { db } = fakeDb(seed(), ['agent_runs'])
    await expect(createCoordinatorStore(db).recordRun({ opportunity_id: 'opp-1' })).rejects.toThrow()
  })
})
