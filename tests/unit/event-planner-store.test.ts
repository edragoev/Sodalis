import { describe, expect, it } from 'vitest'
import { createPlannerStore } from '@/lib/event-planner/store'

// The planner's database layer, with a fake Supabase client that records what it was asked to do.

const checkIn = { id: 'ci-1', senior_id: 's-1', vapi_call_id: 'call-1', transcript: 't', started_at: '', ended_at: null, raw_extraction: null }
const row = { type: 'event', summary: 's', quote: 'q', mentioned_member_id: null, mentioned_item: 'tea', interest_tags: [], target_date: null, urgency: 'normal', confidence: 0.9, suggested_kind: 'visit' } as const

function fakeDb(results: Record<string, unknown>) {
  const calls: { table: string; op: string; arg?: unknown; filters: [string, unknown][] }[] = []
  const db = {
    from(table: string) {
      const call = { table, op: 'select', arg: undefined as unknown, filters: [] as [string, unknown][] }
      calls.push(call)
      const result = () => results[`${table}.${call.op}`] ?? { data: [], error: null }
      const q: Record<string, unknown> = {
        select: (cols?: string) => ((call.arg = cols), q),
        insert: (v: unknown) => ((call.op = 'insert'), (call.arg = v), Promise.resolve(result())),
        update: (v: unknown) => ((call.op = 'update'), (call.arg = v), q),
        eq: (c: string, v: unknown) => (call.filters.push([c, v]), q),
        gte: (c: string, v: unknown) => (call.filters.push([c, v]), q),
        in: (c: string, v: unknown) => (call.filters.push([c, v]), q),
        maybeSingle: () => Promise.resolve(result()),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
      }
      return q
    },
  }
  return { db: db as never, calls }
}

describe('planner store', () => {
  it('never selects phone numbers or tokens for members', async () => {
    const { db, calls } = fakeDb({
      'check_ins.select': { data: checkIn, error: null },
      'seniors.select': { data: { name: 'Rose Tester', timezone: 'America/Toronto' }, error: null },
    })
    const ctx = await createPlannerStore(db).load('ci-1')
    expect(ctx?.senior).toEqual({ first_name: 'Rose', timezone: 'America/Toronto' })
    const memberSelect = String(calls.find((c) => c.table === 'family_members')?.arg)
    expect(memberSelect).not.toMatch(/phone|fcm|token/)
  })

  it('returns null for an unknown check-in and a generic error when the read fails', async () => {
    expect(await createPlannerStore(fakeDb({ 'check_ins.select': { data: null, error: null } }).db).load('x')).toBeNull()
    const err = { data: null, error: { message: 'secret detail' } }
    await expect(createPlannerStore(fakeDb({ 'check_ins.select': err }).db).load('x')).rejects.toThrow('Could not load the check-in')
  })

  it('inserts extracted rows tied to the call, and tolerates a repeat (unique violation)', async () => {
    const dup = fakeDb({ 'opportunities.insert': { error: { code: '23505', message: 'dup' } } })
    await expect(createPlannerStore(dup.db).saveIdeas(checkIn, [row])).resolves.toBeUndefined()
    expect(dup.calls[0].arg).toMatchObject({ source: 'extraction', check_in_id: 'ci-1', check_in_vapi_call_id: 'call-1', senior_id: 's-1' })
  })

  it('fails on any other insert error, without leaking its message', async () => {
    const { db } = fakeDb({ 'opportunities.insert': { error: { code: '42501', message: 'row data here' } } })
    await expect(createPlannerStore(db).saveIdeas(checkIn, [row])).rejects.toThrow('Could not save an opportunity')
  })

  it('proposes only detected extraction rows with confidence of at least 0.6', async () => {
    const { db, calls } = fakeDb({
      'opportunities.select': { data: [{ id: 'a', confidence: 0.6 }, { id: 'b', confidence: 0.59 }, { id: 'c', confidence: '0.9' }, { id: 'd', confidence: null }], error: null },
    })
    expect(await createPlannerStore(db).openIds('ci-1')).toEqual(['a', 'c', 'd'])
    expect(calls[0].filters).toEqual([['check_in_id', 'ci-1'], ['source', 'extraction'], ['status', 'detected']])
  })

  it('writes the extraction record to the check-in', async () => {
    const { db, calls } = fakeDb({})
    await createPlannerStore(db).saveResult('ci-1', { status: 'ok' })
    expect(calls[0]).toMatchObject({ table: 'check_ins', op: 'update', arg: { raw_extraction: { status: 'ok' } }, filters: [['id', 'ci-1']] })
  })

  it('reads outcomes only when there is something to read', async () => {
    const { db, calls } = fakeDb({})
    expect(await createPlannerStore(db).outcomes([])).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
