import type { SupabaseClient } from '@supabase/supabase-js'
import type { Window } from '@/lib/availability'
import type { Interval } from './slots'
import type { SchedulerData } from './get-slots'

// The real source for getSlots: the elder's and the member's free hours, and what is already booked.
// v1 reads the manual grid; Google Calendar would replace the member's windows here and nowhere else.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DEFAULT_LENGTH_MS = { visit: 2 * 3_600_000, call: 30 * 60_000 }
// A completed visit still counts toward the 24 h gap, so it is read as well as confirmed ones.
const CONTACT_STATUSES = ['confirmed', 'completed']

/** Keeps the well-formed windows. Stored values can be anything (the column defaults to `{}`). */
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

// Generic messages on purpose: a database error could quote data that should not reach a log or a caller.
const fail = () => new Error('Could not load availability')

export function createSchedulerLoader(db: SupabaseClient) {
  return async function load(memberId: string): Promise<SchedulerData | null> {
    const { data: member, error: memberError } = await db
      .from('family_members')
      .select('senior_id, manual_availability')
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

    return {
      timezone: senior.data?.timezone ?? 'UTC',
      seniorWindows: cleanWindows(senior.data?.preferred_windows),
      memberWindows: cleanWindows(member.manual_availability),
      // Google busy time is fetched live when the member connects Calendar; the scheduler accepts it
      // here without changing the slot algorithm or the manual availability fallback.
      busyWindows: [],
      visits: (visits.data ?? []).map(
        (v): Interval => ({
          starts_at: v.starts_at,
          ends_at:
            v.ends_at ??
            new Date(Date.parse(v.starts_at) + (v.kind === 'call' ? DEFAULT_LENGTH_MS.call : DEFAULT_LENGTH_MS.visit)).toISOString(),
        }),
      ),
      // There is no hope_calls table yet, so there are no Hope calls to avoid.
      hopeCalls: [],
    }
  }
}
