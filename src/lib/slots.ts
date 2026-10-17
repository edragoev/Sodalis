// Slot times shown to people, in the elder's timezone.

/** "Thu 4pm", "Fri 10:30am", in the given IANA timezone. */
export function formatSlot(startsAt: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(startsAt))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const minute = get('minute')
  const time = `${get('hour')}${minute === '00' ? '' : `:${minute}`}${get('dayPeriod').toLowerCase()}`
  return `${get('weekday')} ${time}`
}
