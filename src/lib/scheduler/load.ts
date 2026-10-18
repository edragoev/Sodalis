import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/google/crypto'
import { fetchBusyWindows } from '@/lib/google/calendar'
import { expandEvents } from '@/lib/calendar/expand'
import type { CalendarRow } from '@/lib/calendar/import'
import { FREE_HOURS, type Interval } from './slots'
import type { SchedulerData } from './get-slots'

// The real source for getSlots: the fixed free hours (FREE_HOURS) and what takes time out of them: the member's
// uploaded calendar, Google Calendar busy blocks when connected, and the elder's booked visits.

const DEFAULT_LENGTH_MS = { visit: 2 * 3_600_000, call: 30 * 60_000 }
const CONTACT_STATUSES = ['confirmed', 'completed']

const fail = () => new Error('Could not load availability')

const CALENDAR_COLUMNS = 'id, uid, recurrence_id, title, notes, starts_at, ends_at, all_day, rrule, exdates, source_tz'
// getSlots looks at most a week ahead; the extra day covers a slot that starts near the edge.
const CALENDAR_HORIZON_MS = 8 * 24 * 60 * 60 * 1000

/**
 * The member's uploaded calendar (.ics / .zip import) as busy time. Timed events only: all-day events
 * (birthdays, holidays) are a hint, not a block, as in calendar/busy.ts.
 */
async function uploadedBusyWindows(db: SupabaseClient, memberId: string): Promise<Interval[]> {
  const { data, error } = await db.from('calendar_events').select(CALENDAR_COLUMNS).eq('member_id', memberId)
  if (error) throw fail()
  const now = Date.now()
  return expandEvents((data ?? []) as (CalendarRow & { id: string })[], new Date(now), new Date(now + CALENDAR_HORIZON_MS))
    .filter((event) => !event.all_day)
    .map((event) => ({ starts_at: event.starts_at, ends_at: event.ends_at }))
}

export function createSchedulerLoader(
  db: SupabaseClient,
  google = { fetchBusyWindows },
) {
  return async function load(memberId: string): Promise<SchedulerData | null> {
    const { data: member, error: memberError } = await db
      .from('family_members')
      .select('senior_id, google_refresh_token, calendar_connected')
      .eq('id', memberId)
      .maybeSingle()
    if (memberError) throw fail()
    if (!member) return null

    const [senior, visits] = await Promise.all([
      db.from('seniors').select('timezone').eq('id', member.senior_id).maybeSingle(),
      db
        .from('visits')
        .select('starts_at, ends_at, kind')
        .eq('senior_id', member.senior_id)
        .in('status', CONTACT_STATUSES),
    ])
    if (senior.error || visits.error) throw fail()

    let busyWindows: Interval[] = await uploadedBusyWindows(db, memberId)
    const connected = Boolean(member.calendar_connected) && typeof member.google_refresh_token === 'string' && member.google_refresh_token
    if (connected) {
      const refreshToken = decryptToken(member.google_refresh_token)
      const now = Date.now()
      const windows = await google.fetchBusyWindows({
        refreshToken,
        timeMin: new Date(now).toISOString(),
        timeMax: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      busyWindows = [...busyWindows, ...windows.map((window) => ({ starts_at: window.start, ends_at: window.end }))]
    }

    return {
      timezone: senior.data?.timezone ?? 'UTC',
      freeWindows: FREE_HOURS,
      busyWindows,
      visits: (visits.data ?? []).map(
        (v): Interval => ({
          starts_at: v.starts_at,
          ends_at:
            v.ends_at ??
            new Date(Date.parse(v.starts_at) + (v.kind === 'call' ? DEFAULT_LENGTH_MS.call : DEFAULT_LENGTH_MS.visit)).toISOString(),
        }),
      ),
      hopeCalls: [],
    }
  }
}
