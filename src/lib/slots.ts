// Slot times shown to people, in the elder's timezone.

/** "Thu 4pm", "Fri 10:30am", in the given IANA timezone. */
export function formatSlot(startsAt: string, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone })
  } catch {
    // An unknown timezone name ("Eastern", "") throws a RangeError, which would crash the page; show UTC instead.
    format = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' })
  }
  const parts = format.formatToParts(new Date(startsAt))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const minute = get('minute')
  const time = `${get('hour')}${minute === '00' ? '' : `:${minute}`}${get('dayPeriod').toLowerCase()}`
  return `${get('weekday')} ${time}`
}
