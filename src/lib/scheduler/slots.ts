import type { Window } from '@/lib/availability'

// The v1 scheduler (specs/04-scheduler/algorithm.md "v1 (demo)"): pure slot math, no database.
// Windows are the elder's `preferred_windows` and a member's `manual_availability`: local 24 h times per
// weekday. Everything is computed in UTC and returned as ISO strings.

export type Interval = { starts_at: string; ends_at: string }
export type Slot = Interval & { id: string }
export type Kind = 'visit' | 'call'

export type OpportunityTweaks = {
  /** 'YYYY-MM-DD': slots on that day (in the elder's timezone) or earlier. */
  targetDate?: string | null
  /** Prefer the next 3 days, such as a gift_errand with zucchini. */
  perishable?: boolean
}

export type SlotInput = {
  memberId: string
  now: Date
  days: number
  timezone: string
  kind: Kind
  seniorWindows: Window[]
  memberWindows: Window[]
  /** Google busy time blocks from the member's calendar. */
  busyWindows?: Interval[]
  /** Confirmed visits for the elder, with anyone: they block their time and the 24 h either side. */
  visits: Interval[]
  /** Hope check-in calls: they block only their own time. */
  hopeCalls: Interval[]
  opportunity?: OpportunityTweaks
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const GRID_MINUTES = 30
const MIN_GAP = DAY
const PERISHABLE_DAYS = 3
const MAX_SLOTS = 3
const LENGTH_MINUTES: Record<Kind, number> = { visit: 120, call: 30 }

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** The parts of an instant on a wall clock in `timezone`. */
function wallClock(ts: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ts))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

/** How far the wall clock in `timezone` is ahead of UTC at that instant, in ms. */
function offsetAt(ts: number, timezone: string): number {
  const w = wallClock(ts, timezone)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ts / 1000) * 1000
}

/** The UTC instant at which the wall clock in `timezone` reads this date and minute of the day. */
function wallToUtc(year: number, month: number, day: number, minutes: number, timezone: string): number {
  const asIfUtc = Date.UTC(year, month - 1, day, 0, minutes)
  const guess = asIfUtc - offsetAt(asIfUtc, timezone)
  // Near a clock change the first guess can sit on the wrong side of it, so settle once more.
  return asIfUtc - offsetAt(guess, timezone)
}

const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const overlaps = (start: number, end: number, other: Interval) =>
  start < Date.parse(other.ends_at) && end > Date.parse(other.starts_at)

/** Free windows in minutes of the day, where both the elder and the member are free on this weekday. */
function sharedRanges(dow: number, a: Window[], b: Window[]): [number, number][] {
  const ranges: [number, number][] = []
  for (const x of a) {
    if (x.dow !== dow) continue
    for (const y of b) {
      if (y.dow !== dow) continue
      const start = Math.max(toMinutes(x.start), toMinutes(y.start))
      const end = Math.min(toMinutes(x.end), toMinutes(y.end))
      if (start < end) ranges.push([start, end])
    }
  }
  return ranges
}

export function computeSlots(input: SlotInput): Slot[] {
  const { memberId, now, days, timezone, kind, seniorWindows, memberWindows, busyWindows = [], visits, hopeCalls, opportunity } = input
  const length = LENGTH_MINUTES[kind]
  const nowMs = now.getTime()
  const horizon = nowMs + days * DAY

  // Candidate starts: every grid step inside a shared free range with room for the whole slot.
  const candidates = new Map<number, string>() // start (UTC ms) -> local date 'YYYY-MM-DD'
  const today = wallClock(nowMs, timezone)
  for (let offset = 0; offset <= days + 1; offset++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset))
    const [year, month, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]
    for (const [from, to] of sharedRanges(d.getUTCDay(), seniorWindows, memberWindows)) {
      const first = Math.ceil(from / GRID_MINUTES) * GRID_MINUTES
      for (let m = first; m + length <= to; m += GRID_MINUTES) {
        candidates.set(wallToUtc(year, month, day, m, timezone), dateKey(year, month, day))
      }
    }
  }

  let slots = [...candidates]
    .filter(([start]) => start >= nowMs && start < horizon)
    .filter(([start]) => {
      const end = start + length * MINUTE
      if ([...visits, ...hopeCalls, ...busyWindows].some((busy) => overlaps(start, end, busy))) return false
      // 24 h between contacts, which also means at most one contact a day.
      return visits.every((v) => start >= Date.parse(v.ends_at) + MIN_GAP || end <= Date.parse(v.starts_at) - MIN_GAP)
    })
    .filter(([, local]) => !opportunity?.targetDate || local <= opportunity.targetDate)
    .sort((a, b) => a[0] - b[0])

  if (opportunity?.perishable) {
    const soon = slots.filter(([start]) => start < nowMs + PERISHABLE_DAYS * DAY)
    if (soon.length > 0) slots = soon
  }

  return slots.slice(0, MAX_SLOTS).map(([start]) => {
    const starts_at = new Date(start).toISOString()
    return { id: `${memberId}:${starts_at}`, starts_at, ends_at: new Date(start + length * MINUTE).toISOString() }
  })
}

/** Member ids, least recently contacted first; never contacted comes before everyone. Ties keep their order. */
export function orderByLeastRecentContact(members: { id: string; last_contact_at: string | null }[]): string[] {
  const at = (m: { last_contact_at: string | null }) => (m.last_contact_at ? Date.parse(m.last_contact_at) : -Infinity)
  return [...members].sort((a, b) => (at(a) === at(b) ? 0 : at(a) < at(b) ? -1 : 1)).map((m) => m.id)
}
