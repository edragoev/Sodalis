import { describe, expect, it } from 'vitest'
import { timeRange } from '@/lib/time-range'

// Start and end times for events and visits ("4:00 – 5:30 PM"), falling back to the start alone.

const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m).toISOString()

describe('timeRange', () => {
  it('shows a start and an end', () => {
    const text = timeRange(at(16), at(17, 30))
    expect(text).toMatch(/4:00/)
    expect(text).toMatch(/5:30/)
  })

  it('shows only the start when there is no end, or the end is not after the start', () => {
    expect(timeRange(at(14))).not.toMatch(/–|-/)
    expect(timeRange(at(14), null)).not.toMatch(/–|-/)
    expect(timeRange(at(14), at(14))).not.toMatch(/–|-/)
    expect(timeRange(at(14), 'not a date')).not.toMatch(/–|-/)
  })
})
