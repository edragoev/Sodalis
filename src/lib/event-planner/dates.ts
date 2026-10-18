// Date handling for target_date. The elder's calendar day is what matters, so everything is read in their zone.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_AHEAD_DAYS = 366

/** 'YYYY-MM-DD' of an instant on the wall clock in `timezone`. */
export function localDate(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

const dayNumber = (iso: string) => {
  const [, y, m, d] = ISO_DATE.exec(iso)!
  return Date.UTC(Number(y), Number(m) - 1, Number(d)) / 86_400_000
}

/**
 * A usable target date, or null. Accepts a real calendar date (or an ISO timestamp, whose date part is used)
 * that is today or later and within a year. A past or impossible date is dropped rather than guessed.
 */
export function normalizeTargetDate(value: unknown, today: string): string | null {
  if (typeof value !== 'string') return null
  const date = value.trim().slice(0, 10)
  const match = ISO_DATE.exec(date)
  if (!match) return null
  const [, y, m, d] = match
  const check = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (check.getUTCFullYear() !== Number(y) || check.getUTCMonth() !== Number(m) - 1 || check.getUTCDate() !== Number(d)) return null
  const ahead = dayNumber(date) - dayNumber(today)
  return ahead >= 0 && ahead <= MAX_AHEAD_DAYS ? date : null
}
