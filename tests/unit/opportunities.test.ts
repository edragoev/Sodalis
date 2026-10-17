import { describe, expect, it } from 'vitest'
import { normalizeSlots, opportunityTitle, slotEnd } from '@/lib/opportunities'

describe('normalizeSlots', () => {
  it('reads the documented shape and sorts by time', () => {
    const slots = normalizeSlots([
      { id: 's2', starts_at: '2026-10-19T10:00:00Z', kind: 'call', member_id: 'm1' },
      { id: 's1', starts_at: '2026-10-18T16:00:00Z', ends_at: '2026-10-18T18:00:00Z' },
    ])
    expect(slots.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(slots[0]).toMatchObject({ ends_at: '2026-10-18T18:00:00.000Z', kind: null, member_id: null })
    expect(slots[1]).toMatchObject({ kind: 'call', member_id: 'm1' })
  })

  it('accepts start/end aliases and makes up ids', () => {
    const [slot] = normalizeSlots([{ start: '2026-10-18T16:00:00Z', end: '2026-10-18T17:00:00Z' }])
    expect(slot.id).toBe('slot-0')
    expect(slot.ends_at).toBe('2026-10-18T17:00:00.000Z')
  })

  it('drops junk instead of throwing', () => {
    expect(normalizeSlots(null)).toEqual([])
    expect(normalizeSlots('x')).toEqual([])
    expect(normalizeSlots([null, 3, {}, { starts_at: 'not a date' }])).toEqual([])
  })
})

describe('slotEnd', () => {
  const base = { id: 's', starts_at: '2026-10-18T16:00:00.000Z', ends_at: null, kind: null, member_id: null }
  it('defaults a visit to 2 hours and a call to 30 minutes', () => {
    expect(slotEnd(base, 'visit')).toBe('2026-10-18T18:00:00.000Z')
    expect(slotEnd(base, 'call')).toBe('2026-10-18T16:30:00.000Z')
    expect(slotEnd({ ...base, kind: 'call' }, 'visit')).toBe('2026-10-18T16:30:00.000Z')
  })
  it('keeps an explicit end', () => {
    expect(slotEnd({ ...base, ends_at: '2026-10-18T17:15:00.000Z' }, 'visit')).toBe('2026-10-18T17:15:00.000Z')
  })
})

describe('opportunityTitle', () => {
  it('names the item for errands and the elder for contact', () => {
    expect(opportunityTitle('gift_errand', 'zucchini', 'Margaret')).toBe('A visit idea: zucchini')
    expect(opportunityTitle('gift_errand', null, 'Margaret')).toBe('A visit idea')
    expect(opportunityTitle('wants_contact', null, 'Margaret')).toBe('Margaret would love to hear from you')
  })
})
