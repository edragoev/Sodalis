import { describe, expect, it } from 'vitest'
import { SLOTS, cellKey, dayKeys, fromWindows, slotKeys, toWindows, validateWindows } from '@/lib/availability'

describe('availability slots', () => {
  it('are seven 2-hour slots from 8 am to 10 pm', () => {
    expect(SLOTS).toHaveLength(7)
    expect(SLOTS[0]).toMatchObject({ label: '8 am', start: '08:00', end: '10:00' })
    expect(SLOTS[2]).toMatchObject({ label: '12 pm', start: '12:00', end: '14:00' })
    expect(SLOTS[6]).toMatchObject({ label: '8 pm', start: '20:00', end: '22:00' })
    SLOTS.forEach((s, i) => i && expect(s.start).toBe(SLOTS[i - 1].end)) // no gaps, no overlaps
  })

  it('knows every cell of a day and of a time of day', () => {
    expect(dayKeys(3)).toHaveLength(7)
    expect(slotKeys(2)).toHaveLength(7)
    expect(dayKeys(3)).toContain(cellKey(3, 6))
    expect(slotKeys(2)).toContain(cellKey(6, 2))
  })
})

describe('availability windows', () => {
  it('merges touching slots on the same day', () => {
    const w = toWindows(new Set([cellKey(1, 4), cellKey(1, 5), cellKey(1, 6)]))
    expect(w).toEqual([{ dow: 1, start: '16:00', end: '22:00' }])
  })

  it('keeps gaps as separate windows', () => {
    const w = toWindows(new Set([cellKey(2, 0), cellKey(2, 2)]))
    expect(w).toEqual([
      { dow: 2, start: '08:00', end: '10:00' },
      { dow: 2, start: '12:00', end: '14:00' },
    ])
  })

  it('does not merge across days', () => {
    expect(toWindows(new Set([cellKey(0, 6), cellKey(1, 0)]))).toHaveLength(2)
  })

  it('round-trips through windows', () => {
    const cells = new Set([cellKey(0, 0), cellKey(0, 1), cellKey(3, 5), cellKey(6, 2), cellKey(6, 3), cellKey(6, 6)])
    expect(fromWindows(toWindows(cells))).toEqual(cells)
  })

  it('a whole day becomes one window', () => {
    expect(toWindows(new Set(dayKeys(6)))).toEqual([{ dow: 6, start: '08:00', end: '22:00' }])
  })

  it('selects only fully covered slots, so older wide windows never claim extra time', () => {
    // The previous 4-5 hour blocks: morning 08-12 covers two whole slots; evening 17-21 only one.
    expect([...fromWindows([{ dow: 1, start: '08:00', end: '12:00' }])].sort()).toEqual([cellKey(1, 0), cellKey(1, 1)])
    expect([...fromWindows([{ dow: 1, start: '17:00', end: '21:00' }])]).toEqual([cellKey(1, 5)])
    expect(fromWindows([{ dow: 4, start: '09:00', end: '11:00' }]).size).toBe(0) // fits no whole slot
  })

  it('ignores junk instead of throwing', () => {
    expect(fromWindows('not a list').size).toBe(0)
    expect(fromWindows([null, { nope: true }, { dow: 'x', start: 1, end: 2 }]).size).toBe(0)
  })

  it('validates the server payload', () => {
    expect(validateWindows([{ dow: 1, start: '09:00', end: '12:00' }])).toBeNull()
    expect(validateWindows([{ dow: 1, start: '20:00', end: '22:00' }])).toBeNull() // the last slot
    expect(validateWindows('x')).not.toBeNull()
    expect(validateWindows([{ dow: 7, start: '09:00', end: '12:00' }])).not.toBeNull()
    expect(validateWindows([{ dow: 1, start: '9:00', end: '12:00' }])).not.toBeNull()
    expect(validateWindows([{ dow: 1, start: '12:00', end: '09:00' }])).not.toBeNull()
    expect(validateWindows(Array(51).fill({ dow: 1, start: '09:00', end: '10:00' }))).not.toBeNull()
  })
})
