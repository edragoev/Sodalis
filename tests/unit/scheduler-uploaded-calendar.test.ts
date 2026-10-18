import { describe, expect, it } from 'vitest'
import { createSchedulerLoader } from '@/lib/scheduler/load'

// An uploaded .ics/.zip calendar blocks the member's time in the scheduler
// (specs/10-calendar/google-calendar-import.md section 4).

const row = (over: Record<string, unknown> = {}) => ({
  id: 'e1', uid: 'u1', recurrence_id: null, title: 'Dentist', notes: null,
  starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T15:00:00.000Z',
  all_day: false, rrule: null, exdates: [], source_tz: 'UTC', ...over,
})

function loaderWith(events: unknown[]) {
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, value: string) => {
          if (table === 'calendar_events') return Promise.resolve({ data: events, error: null })
          return {
            maybeSingle: async () =>
              table === 'family_members'
                ? { data: { id: value, senior_id: 's1', manual_availability: [], google_refresh_token: null, calendar_connected: false }, error: null }
                : { data: { timezone: 'UTC', preferred_windows: [] }, error: null },
            in: () => ({ data: [], error: null }),
          }
        },
      }),
    }),
  }
  return createSchedulerLoader(db as never)
}

describe('scheduler loader and the uploaded calendar', () => {
  it('counts a timed event in the next week as busy', async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000)
    const start = new Date(Date.UTC(soon.getUTCFullYear(), soon.getUTCMonth(), soon.getUTCDate(), 14))
    const result = await loaderWith([row({ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3_600_000).toISOString() })])('m1')
    expect(result?.busyWindows).toEqual([{ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3_600_000).toISOString() }])
  })

  it('expands a weekly series and honours its EXDATE', async () => {
    const start = new Date(Date.UTC(2026, 0, 5, 10)) // a Monday long ago
    const result = await loaderWith([row({ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3_600_000).toISOString(), rrule: 'FREQ=DAILY' })])('m1')
    // A daily series always has occurrences in the next 8 days; the loader returns them as intervals.
    expect(result!.busyWindows!.length).toBeGreaterThanOrEqual(7)
    expect(result!.busyWindows![0]).toEqual({ starts_at: expect.any(String), ends_at: expect.any(String) })
  })

  it('ignores all-day events, past events and an empty calendar', async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString()
    expect((await loaderWith([row({ all_day: true, starts_at: soon, ends_at: soon })])('m1'))?.busyWindows).toEqual([])
    expect((await loaderWith([row()])('m1'))?.busyWindows).toEqual([])
    expect((await loaderWith([])('m1'))?.busyWindows).toEqual([])
  })

  it('throws, rather than reading "free", when the calendar cannot be loaded', async () => {
    const db = {
      from: (table: string) => ({
        select: () => ({
          eq: () =>
            table === 'calendar_events'
              ? Promise.resolve({ data: null, error: { message: 'down' } })
              : { maybeSingle: async () => ({ data: { senior_id: 's1', manual_availability: [] }, error: null }), in: () => ({ data: [], error: null }) },
        }),
      }),
    }
    await expect(createSchedulerLoader(db as never)('m1')).rejects.toThrow('Could not load availability')
  })
})
