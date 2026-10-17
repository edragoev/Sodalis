import { describe, expect, it } from 'vitest'
import { cellKey, fromWindows, toWindows, validateWindows } from '@/lib/availability'

describe('availability windows', () => {
  it('merges touching blocks on the same day', () => {
    const w = toWindows(new Set([cellKey(1, 0), cellKey(1, 1), cellKey(1, 2)]))
    expect(w).toEqual([{ dow: 1, start: '08:00', end: '21:00' }])
  })

  it('keeps gaps as separate windows', () => {
    const w = toWindows(new Set([cellKey(2, 0), cellKey(2, 2)]))
    expect(w).toEqual([
      { dow: 2, start: '08:00', end: '12:00' },
      { dow: 2, start: '17:00', end: '21:00' },
    ])
  })

  it('does not merge across days', () => {
    const w = toWindows(new Set([cellKey(0, 2), cellKey(1, 0)]))
    expect(w).toHaveLength(2)
  })

  it('round-trips through windows', () => {
    const cells = new Set([cellKey(0, 0), cellKey(0, 1), cellKey(3, 2), cellKey(6, 1)])
    expect(fromWindows(toWindows(cells))).toEqual(cells)
  })

  it('selects only fully covered blocks and ignores junk', () => {
    const cells = fromWindows([{ dow: 4, start: '09:00', end: '15:00' }, { nope: true }, null])
    expect(cells.size).toBe(0) // 09-15 fully covers neither the morning nor afternoon block
    expect(fromWindows('not a list').size).toBe(0)
  })

  it('validates the server payload', () => {
    expect(validateWindows([{ dow: 1, start: '09:00', end: '12:00' }])).toBeNull()
    expect(validateWindows('x')).not.toBeNull()
    expect(validateWindows([{ dow: 7, start: '09:00', end: '12:00' }])).not.toBeNull()
    expect(validateWindows([{ dow: 1, start: '9:00', end: '12:00' }])).not.toBeNull()
    expect(validateWindows([{ dow: 1, start: '12:00', end: '09:00' }])).not.toBeNull()
    expect(validateWindows(Array(51).fill({ dow: 1, start: '09:00', end: '10:00' }))).not.toBeNull()
  })
})
