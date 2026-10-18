import { beforeEach, describe, expect, it } from 'vitest'
import { createSchedulerLoader } from '@/lib/scheduler/load'

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

describe('createSchedulerLoader Google Calendar', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'test-secret'
  })

  it('loads live Google busy windows when a member has an active calendar connection', async () => {
    const seed = {
      seniors: [{ id: 'senior-1', timezone: 'America/Toronto', preferred_windows: [{ dow: 6, start: '08:00', end: '20:00' }] }],
      family_members: [{
        id: 'danny',
        senior_id: 'senior-1',
        manual_availability: [{ dow: 6, start: '09:00', end: '17:00' }],
        google_refresh_token: 'v1:____:____:____',
        calendar_connected: true,
      }],
      visits: [],
    }

    const loader = createSchedulerLoader(fakeDb(seed), {
      fetchBusyWindows: async () => [{ start: '2026-10-16T14:00:00.000Z', end: '2026-10-16T16:00:00.000Z' }],
    })

    const data = await loader('danny')
    expect(data).toMatchObject({
      busyWindows: [{ starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T16:00:00.000Z' }],
    })
  })
})
