import { describe, expect, it } from 'vitest'
import { formatEventTime } from '@/lib/calendar/tz'

const ev = (starts_at: string, ends_at: string, all_day = false) => ({ starts_at, ends_at, all_day })
const TZ = 'America/Toronto'

describe('formatEventTime', () => {
  it('shows start and end on the same day', () => {
    // Mon 19 Oct 2026, 12:00 AM-6:00 AM Toronto (EDT) = 04:00-10:00Z.
    expect(formatEventTime(ev('2026-10-19T04:00:00Z', '2026-10-19T10:00:00Z'), TZ)).toBe('12:00 AM – 6:00 AM')
  })

  it('adds the weekday when the end is on another local day', () => {
    // Sun 18 Oct 11 pm to Mon 19 Oct 6 am Toronto.
    expect(formatEventTime(ev('2026-10-19T03:00:00Z', '2026-10-19T10:00:00Z'), TZ)).toBe('11:00 PM – Mon 6:00 AM')
  })

  it('shows "All day" for all-day events', () => {
    expect(formatEventTime(ev('2026-10-19T04:00:00Z', '2026-10-20T04:00:00Z', true), TZ)).toBe('All day')
  })

  it('shows only the start when the event has no length', () => {
    expect(formatEventTime(ev('2026-10-19T16:00:00Z', '2026-10-19T16:00:00Z'), TZ)).toBe('12:00 PM')
  })
})
