import { describe, expect, it } from 'vitest'
import { createSchedulerLoader } from '@/lib/scheduler/load'

// Reads what getSlots needs from Supabase: the elder's and the member's free hours, and what is already booked.

type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>, failing: string[] = []) {
  function query(table: string) {
    const filters: ((r: Row) => boolean)[] = []
    const run = () => {
      if (failing.includes(table)) return { data: null, error: { message: `connection refused to 10.0.0.5 (${table})` } }
      return { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }
    }
    const q = {
      eq: (column: string, value: unknown) => (filters.push((r) => r[column] === value), q),
      in: (column: string, values: unknown[]) => (filters.push((r) => values.includes(r[column])), q),
      maybeSingle: async () => {
        const r = run()
        return r.error ? r : { data: r.data![0] ?? null, error: null }
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    return q
  }
  return { from: (table: string) => ({ select: () => query(table) }) } as never
}

const windows = [{ dow: 6, start: '09:00', end: '17:00' }]
const seed = () => ({
  seniors: [{ id: 'senior-1', timezone: 'America/Toronto', preferred_windows: [{ dow: 6, start: '08:00', end: '20:00' }] }],
  family_members: [{ id: 'danny', senior_id: 'senior-1', manual_availability: windows }],
  visits: [
    { senior_id: 'senior-1', member_id: 'maya', kind: 'visit', status: 'confirmed', starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T16:00:00.000Z' },
    { senior_id: 'senior-1', member_id: 'sam', kind: 'visit', status: 'completed', starts_at: '2026-10-14T14:00:00.000Z', ends_at: '2026-10-14T16:00:00.000Z' },
    { senior_id: 'senior-1', member_id: 'sam', kind: 'visit', status: 'proposed', starts_at: '2026-10-17T14:00:00.000Z', ends_at: '2026-10-17T16:00:00.000Z' },
    { senior_id: 'senior-1', member_id: 'sam', kind: 'visit', status: 'cancelled', starts_at: '2026-10-18T14:00:00.000Z', ends_at: '2026-10-18T16:00:00.000Z' },
    { senior_id: 'senior-2', member_id: 'x', kind: 'visit', status: 'confirmed', starts_at: '2026-10-19T14:00:00.000Z', ends_at: '2026-10-19T16:00:00.000Z' },
  ],
})

describe('createSchedulerLoader', () => {
  it("returns the elder's timezone and the member's free hours (slots use only those)", async () => {
    const data = await createSchedulerLoader(fakeDb(seed()))('danny')
    expect(data).toMatchObject({ timezone: 'America/Toronto', memberWindows: windows })
    expect(data).not.toHaveProperty('seniorWindows')
  })

  it('returns null for a member who does not exist', async () => {
    expect(await createSchedulerLoader(fakeDb(seed()))('ghost')).toBeNull()
  })

  it('counts confirmed and completed visits for that elder, and nothing else', async () => {
    const data = await createSchedulerLoader(fakeDb(seed()))('danny')
    expect(data!.visits).toEqual([
      { starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T16:00:00.000Z' },
      { starts_at: '2026-10-14T14:00:00.000Z', ends_at: '2026-10-14T16:00:00.000Z' },
    ])
  })

  it('gives a visit with no end time 2 hours, and a call 30 minutes', async () => {
    const data = seed()
    data.visits = [
      { senior_id: 'senior-1', member_id: 'a', kind: 'visit', status: 'confirmed', starts_at: '2026-10-16T14:00:00.000Z', ends_at: null },
      { senior_id: 'senior-1', member_id: 'b', kind: 'call', status: 'confirmed', starts_at: '2026-10-17T14:00:00.000Z', ends_at: null },
    ] as never
    const loaded = await createSchedulerLoader(fakeDb(data))('danny')
    expect(loaded!.visits).toEqual([
      { starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T16:00:00.000Z' },
      { starts_at: '2026-10-17T14:00:00.000Z', ends_at: '2026-10-17T14:30:00.000Z' },
    ])
  })

  it.each([{}, null, 'oops', 5])('treats %j availability as no free hours instead of failing', async (bad) => {
    const data = seed()
    data.family_members = [{ id: 'danny', senior_id: 'senior-1', manual_availability: bad }] as never
    const loaded = await createSchedulerLoader(fakeDb(data))('danny')
    expect(loaded!.memberWindows).toEqual([])
  })

  it('drops windows that are not well formed', async () => {
    const data = seed()
    data.family_members = [
      { id: 'danny', senior_id: 'senior-1', manual_availability: [{ dow: 9, start: '09:00', end: '17:00' }, { dow: 1, start: 'noon', end: '17:00' }, { dow: 2, start: '09:00', end: '17:00' }] },
    ] as never
    const loaded = await createSchedulerLoader(fakeDb(data))('danny')
    expect(loaded!.memberWindows).toEqual([{ dow: 2, start: '09:00', end: '17:00' }])
  })

  it('uses UTC when the elder has no timezone', async () => {
    const data = seed()
    data.seniors = [{ id: 'senior-1', timezone: null, preferred_windows: [] }] as never
    expect((await createSchedulerLoader(fakeDb(data))('danny'))!.timezone).toBe('UTC')
  })

  it('has no Hope calls to avoid yet', async () => {
    expect((await createSchedulerLoader(fakeDb(seed()))('danny'))!.hopeCalls).toEqual([])
  })

  it.each(['family_members', 'seniors', 'visits'])('throws, without leaking why, when %s cannot be read', async (table) => {
    const err = await createSchedulerLoader(fakeDb(seed(), [table]))('danny').catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toContain('10.0.0.5')
  })
})
