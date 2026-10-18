import type { SupabaseClient } from '@supabase/supabase-js'
import type { Window } from '@/lib/availability'
import { decryptToken } from '@/lib/google/crypto'
import { fetchBusyWindows } from '@/lib/google/calendar'
import type { Interval } from './slots'
import type { SchedulerData } from './get-slots'

// The real source for getSlots: the elder's and the member's free hours, and what is already booked.
// Manual availability remains the fallback, while Google Calendar adds live busy blocks when connected.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DEFAULT_LENGTH_MS = { visit: 2 * 3_600_000, call: 30 * 60_000 }
const CONTACT_STATUSES = ['confirmed', 'completed']

function cleanWindows(value: unknown): Window[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (w): w is Window =>
      Number.isInteger(w?.dow) &&
      w.dow >= 0 &&
      w.dow <= 6 &&
      typeof w.start === 'string' &&
      typeof w.end === 'string' &&
      HHMM.test(w.start) &&
      HHMM.test(w.end) &&
      w.start < w.end,
  )
}

const fail = () => new Error('Could not load availability')

export function createSchedulerLoader(
  db: SupabaseClient,
  google = { fetchBusyWindows },
) {
  return async function load(memberId: string): Promise<SchedulerData | null> {
    const { data: member, error: memberError } = await db
      .from('family_members')
      .select('senior_id, manual_availability, google_refresh_token, calendar_connected')
      .eq('id', memberId)
      .maybeSingle()
    if (memberError) throw fail()
    if (!member) return null

    const [senior, visits] = await Promise.all([
      db.from('seniors').select('timezone, preferred_windows').eq('id', member.senior_id).maybeSingle(),
      db
        .from('visits')
        .select('starts_at, ends_at, kind')
        .eq('senior_id', member.senior_id)
        .in('status', CONTACT_STATUSES),
    ])
    if (senior.error || visits.error) throw fail()

    let busyWindows: Interval[] = []
    const connected = Boolean(member.calendar_connected) && typeof member.google_refresh_token === 'string' && member.google_refresh_token
    if (connected) {
      const refreshToken = decryptToken(member.google_refresh_token)
      const now = Date.now()
      const windows = await google.fetchBusyWindows({
        refreshToken,
        timeMin: new Date(now).toISOString(),
        timeMax: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      busyWindows = windows.map((window) => ({ starts_at: window.start, ends_at: window.end }))
    }

    return {
      timezone: senior.data?.timezone ?? 'UTC',
      seniorWindows: cleanWindows(senior.data?.preferred_windows),
      memberWindows: cleanWindows(member.manual_availability),
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
