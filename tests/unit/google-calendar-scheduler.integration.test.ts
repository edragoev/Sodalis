import { describe, expect, it } from 'vitest'
import { computeSlots } from '@/lib/scheduler/slots'

const dateRange = () => [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start: '09:00', end: '17:00' }))

describe('Google Calendar busy windows and scheduling integration', () => {
  it('blocks a slot when it overlaps a Google busy window', () => {
    const now = new Date('2026-10-15T14:10:00.000Z')

    const slots = computeSlots({
      memberId: 'member-1',
      now,
      days: 7,
      timezone: 'America/Toronto',
      kind: 'visit',
      seniorWindows: dateRange(),
      memberWindows: dateRange(),
      busyWindows: [{ starts_at: '2026-10-15T15:00:00.000Z', ends_at: '2026-10-15T16:00:00.000Z' }],
      visits: [],
      hopeCalls: [],
    })

    expect(slots[0].starts_at).toBe('2026-10-15T16:00:00.000Z')
    expect(slots[0].ends_at).toBe('2026-10-15T18:00:00.000Z')
  })

  it('keeps the normal slot flow when no Google busy windows exist', () => {
    const now = new Date('2026-10-15T14:10:00.000Z')

    const slots = computeSlots({
      memberId: 'member-1',
      now,
      days: 7,
      timezone: 'America/Toronto',
      kind: 'visit',
      seniorWindows: dateRange(),
      memberWindows: dateRange(),
      busyWindows: [],
      visits: [],
      hopeCalls: [],
    })

    expect(slots[0]).toMatchObject({
      starts_at: '2026-10-15T14:30:00.000Z',
      ends_at: '2026-10-15T16:30:00.000Z',
    })
  })
})
