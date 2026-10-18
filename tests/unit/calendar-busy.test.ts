import { describe, expect, it } from 'vitest'
import { busyCells } from '@/lib/calendar/busy'
import { cellKey } from '@/lib/availability'

const occ = (starts_at: string, ends_at: string, all_day = false) => ({
  id: 'x', uid: 'x', title: 't', notes: null, starts_at, ends_at, all_day,
})

describe('busyCells', () => {
  it('marks the slot an event falls in, using the viewer zone', () => {
    // Mon 19 Oct 2026, 2:00-3:30 pm Toronto = 18:00-19:30Z. The 2-4 pm slot is index 3.
    const busy = busyCells([occ('2026-10-19T18:00:00Z', '2026-10-19T19:30:00Z')], 'America/Toronto')
    expect([...busy]).toEqual([cellKey(1, 3)])
  })

  it('marks every slot an event overlaps', () => {
    // 11 am-1 pm Toronto touches 10-12 (1) and 12-2 (2).
    const busy = busyCells([occ('2026-10-19T15:00:00Z', '2026-10-19T17:00:00Z')], 'America/Toronto')
    expect([...busy].sort()).toEqual([cellKey(1, 1), cellKey(1, 2)])
  })

  it('does not count an event that only touches a slot edge', () => {
    const busy = busyCells([occ('2026-10-19T16:00:00Z', '2026-10-19T18:00:00Z')], 'America/Toronto') // 12-2 pm
    expect([...busy]).toEqual([cellKey(1, 2)])
  })

  it('ignores all-day events', () => {
    expect(busyCells([occ('2026-10-20T04:00:00Z', '2026-10-21T04:00:00Z', true)], 'America/Toronto').size).toBe(0)
  })
})
