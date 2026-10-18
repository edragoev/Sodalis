import { describe, expect, it } from 'vitest'
import { computeSlots, orderByLeastRecentContact, type SlotInput } from '@/lib/scheduler/slots'

// The v1 scheduler (specs/04-scheduler/algorithm.md "v1 (demo)"): pure slot math, no database.
// Dates: 2026-10-15 is a Thursday. Toronto is UTC-4 until the clocks change on 2026-11-01, then UTC-5.

const TZ = 'America/Toronto'
const NOW = new Date('2026-10-15T14:10:00.000Z') // Thu 10:10 local

const everyDay = (start: string, end: string) => [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start, end }))
const onlyOn = (dow: number, start: string, end: string) => [{ dow, start, end }]

const input = (over: Partial<SlotInput> = {}): SlotInput => ({
  memberId: 'danny',
  now: NOW,
  days: 7,
  timezone: TZ,
  kind: 'visit',
  memberWindows: everyDay('09:00', '17:00'),
  visits: [],
  hopeCalls: [],
  ...over,
})

const starts = (slots: { starts_at: string }[]) => slots.map((s) => s.starts_at)
const HOUR = 3_600_000

describe('computeSlots', () => {
  describe('what a slot is', () => {
    it('is 2 hours for a visit and 30 minutes for a call', () => {
      const [visit] = computeSlots(input({ kind: 'visit' }))
      const [call] = computeSlots(input({ kind: 'call' }))
      expect(Date.parse(visit.ends_at) - Date.parse(visit.starts_at)).toBe(2 * HOUR)
      expect(Date.parse(call.ends_at) - Date.parse(call.starts_at)).toBe(HOUR / 2)
    })

    it('is an ISO UTC time with a stable, unique id', () => {
      const slots = computeSlots(input())
      expect(slots[0].starts_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/)
      expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length)
      expect(computeSlots(input()).map((s) => s.id)).toEqual(slots.map((s) => s.id))
    })
  })

  describe('where slots may fall', () => {
    it("only inside the member's free hours; the elder's preferred hours are not used", () => {
      const slots = computeSlots(input({ memberWindows: onlyOn(6, '14:00', '20:00') }))
      expect(starts(slots)).toEqual([
        '2026-10-17T18:00:00.000Z', // Sat 14:00 local
        '2026-10-17T18:30:00.000Z',
        '2026-10-17T19:00:00.000Z',
      ])
    })

    it('reads windows in the elder\'s timezone, including after the clocks change', () => {
      const monday = onlyOn(1, '16:00', '18:00')
      const before = computeSlots(input({ now: new Date('2026-10-12T12:00:00.000Z'), memberWindows: monday }))
      const after = computeSlots(input({ now: new Date('2026-10-29T12:00:00.000Z'), memberWindows: monday }))
      expect(starts(before)).toEqual(['2026-10-12T20:00:00.000Z']) // 16:00 EDT
      expect(starts(after)).toEqual(['2026-11-02T21:00:00.000Z']) // 16:00 EST
    })

    it('on the 30-minute grid, and never before now', () => {
      const [first] = computeSlots(input({ kind: 'call' }))
      expect(first.starts_at).toBe('2026-10-15T14:30:00.000Z') // now is 10:10, so the next half hour is 10:30
    })

    it('can start exactly at now when now is on the grid', () => {
      const [first] = computeSlots(input({ kind: 'call', now: new Date('2026-10-15T14:00:00.000Z') }))
      expect(first.starts_at).toBe('2026-10-15T14:00:00.000Z')
    })

    it('rounds a window that starts off the grid up to the next half hour', () => {
      const w = onlyOn(5, '09:15', '12:00')
      const [first] = computeSlots(input({ kind: 'call', memberWindows: w }))
      expect(first.starts_at).toBe('2026-10-16T13:30:00.000Z') // 09:30 local
    })

    it('not beyond the horizon', () => {
      const slots = computeSlots(input({ days: 2, kind: 'call' }))
      const limit = NOW.getTime() + 2 * 24 * HOUR
      expect(slots.length).toBeGreaterThan(0)
      expect(slots.every((s) => Date.parse(s.starts_at) < limit)).toBe(true)
    })

    it('not when the free run is too short for the kind', () => {
      const w = everyDay('09:00', '10:30') // 90 minutes
      expect(computeSlots(input({ kind: 'visit', memberWindows: w }))).toEqual([])
      expect(computeSlots(input({ kind: 'call', memberWindows: w })).length).toBeGreaterThan(0)
    })

    it.each([
      ['the member has no free hours', { memberWindows: [] }],
    ])('none when %s', (_name, over) => {
      expect(computeSlots(input(over))).toEqual([])
    })
  })

  describe('which slots are offered', () => {
    it('the first 3 by earliest start', () => {
      const slots = computeSlots(input())
      expect(starts(slots)).toEqual([
        '2026-10-15T14:30:00.000Z', // Thu 10:30 (it is already 10:10)
        '2026-10-15T15:00:00.000Z', // Thu 11:00
        '2026-10-15T15:30:00.000Z', // Thu 11:30
      ])
    })

    it('carries on into the next day when today runs out', () => {
      const thu = { dow: 4, start: '09:00', end: '13:00' }
      const fri = { dow: 5, start: '09:00', end: '17:00' }
      const slots = computeSlots(input({ memberWindows: [thu, fri] }))
      expect(starts(slots)).toEqual([
        '2026-10-15T14:30:00.000Z', // Thu 10:30-12:30
        '2026-10-15T15:00:00.000Z', // Thu 11:00-13:00
        '2026-10-16T13:00:00.000Z', // Fri 09:00
      ])
    })

    it('fewer than 3 when fewer slots fit', () => {
      const w = onlyOn(5, '09:00', '11:30') // a 2 h visit can start at 09:00 or 09:30
      expect(starts(computeSlots(input({ memberWindows: w })))).toEqual([
        '2026-10-16T13:00:00.000Z',
        '2026-10-16T13:30:00.000Z',
      ])
    })
  })

  describe('visits and calls already booked', () => {
    // Fri 10:00-12:00 local
    const friday = { starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T16:00:00.000Z' }

    it('keeps 24 hours from another contact, and so at most one contact a day', () => {
      const slots = computeSlots(input({ visits: [friday] }))
      // Nothing ends 24 h before Fri 10:00, and nothing starts before Sat 12:00 (24 h after it ends).
      expect(slots[0].starts_at).toBe('2026-10-17T16:00:00.000Z')
      expect(slots.every((s) => Date.parse(s.starts_at) >= Date.parse('2026-10-17T16:00:00.000Z'))).toBe(true)
    })

    it('counts a contact with anyone in the family, not just this member', () => {
      // The visit is passed in without a member: any visit for the elder counts.
      expect(computeSlots(input({ visits: [friday], memberId: 'maya' }))[0].starts_at).toBe('2026-10-17T16:00:00.000Z')
    })

    it('only blocks the overlap for a Hope call, with no 24 hour gap', () => {
      const friday1030 = { starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T14:30:00.000Z' } // 10:00-10:30
      const w = onlyOn(5, '09:00', '14:00')
      const slots = computeSlots(input({ memberWindows: w, hopeCalls: [friday1030] }))
      // 09:00 to 11:00 would overlap the call; the first visit that clears it starts at 10:30
      expect(starts(slots)).toEqual(['2026-10-16T14:30:00.000Z', '2026-10-16T15:00:00.000Z', '2026-10-16T15:30:00.000Z'])
    })

    it('works when there is nothing booked', () => {
      expect(computeSlots(input({ visits: [], hopeCalls: [] })).length).toBeGreaterThan(0)
    })
  })

  describe('what the opportunity asks for', () => {
    // Saturday, Sunday and Wednesday each have exactly one 2 h visit (10:00-12:00 local).
    const sat = { dow: 6, start: '10:00', end: '12:00' }
    const sun = { dow: 0, start: '10:00', end: '12:00' }
    const wed = { dow: 3, start: '10:00', end: '12:00' }
    const windows = (...w: { dow: number; start: string; end: string }[]) => ({ memberWindows: w })

    it('includes the target day itself, for example a ride to an appointment that day', () => {
      const slots = computeSlots(input({ ...windows(sat, sun), opportunity: { targetDate: '2026-10-17' } }))
      expect(starts(slots)).toEqual(['2026-10-17T14:00:00.000Z']) // Sat 10:00; Sunday is after the target
    })

    it('includes today when today is the target day', () => {
      const slots = computeSlots(input({ opportunity: { targetDate: '2026-10-15' } }))
      expect(slots[0].starts_at).toBe('2026-10-15T14:30:00.000Z')
      expect(slots.every((s) => s.starts_at.startsWith('2026-10-15'))).toBe(true)
    })

    it('offers nothing when the target date has passed', () => {
      expect(computeSlots(input({ opportunity: { targetDate: '2026-10-14' } }))).toEqual([])
    })

    it('judges the target day in the elder\'s timezone', () => {
      // Sat 22:00 local is already Sunday in UTC; it is still the 17th for the elder.
      const late = { dow: 6, start: '20:00', end: '22:00' }
      const slots = computeSlots(input({ ...windows(late), opportunity: { targetDate: '2026-10-17' } }))
      expect(starts(slots)).toEqual(['2026-10-18T00:00:00.000Z'])
    })

    it('prefers the next 3 days for something perishable', () => {
      const w = windows(wed, sat)
      expect(starts(computeSlots(input(w)))).toEqual(['2026-10-17T14:00:00.000Z', '2026-10-21T14:00:00.000Z'])
      expect(starts(computeSlots(input({ ...w, opportunity: { perishable: true } })))).toEqual(['2026-10-17T14:00:00.000Z'])
    })

    it('still offers later days when nothing falls in the next 3 days', () => {
      const slots = computeSlots(input({ ...windows(wed), opportunity: { perishable: true } }))
      expect(starts(slots)).toEqual(['2026-10-21T14:00:00.000Z'])
    })

    it('applies both together', () => {
      const slots = computeSlots(input({ ...windows(wed, sat), opportunity: { perishable: true, targetDate: '2026-10-16' } }))
      expect(slots).toEqual([])
    })
  })
})

describe('orderByLeastRecentContact', () => {
  it('puts the member who was contacted longest ago first', () => {
    const ids = orderByLeastRecentContact([
      { id: 'maya', last_contact_at: '2026-10-10T12:00:00.000Z' },
      { id: 'danny', last_contact_at: '2026-09-01T12:00:00.000Z' },
      { id: 'sam', last_contact_at: '2026-10-14T12:00:00.000Z' },
    ])
    expect(ids).toEqual(['danny', 'maya', 'sam'])
  })

  it('puts someone never contacted before everyone else', () => {
    const ids = orderByLeastRecentContact([
      { id: 'maya', last_contact_at: '2026-01-01T12:00:00.000Z' },
      { id: 'lena', last_contact_at: null },
    ])
    expect(ids).toEqual(['lena', 'maya'])
  })

  it('keeps the given order for ties, and leaves the input alone', () => {
    const members = [
      { id: 'b', last_contact_at: null },
      { id: 'a', last_contact_at: null },
    ]
    expect(orderByLeastRecentContact(members)).toEqual(['b', 'a'])
    expect(members.map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('handles nobody', () => {
    expect(orderByLeastRecentContact([])).toEqual([])
  })
})
