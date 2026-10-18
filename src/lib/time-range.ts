const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/**
 * "4:00 – 5:30 p.m." for a start and end on the same day; just the start time when there is no
 * usable end. Uses the browser's formatRange, which drops the repeated "p.m." where the locale does.
 */
export function timeRange(start: string, end?: string | null): string {
  const a = new Date(start);
  const b = end ? new Date(end) : null;
  const fmt = new Intl.DateTimeFormat(undefined, TIME);
  if (!b || Number.isNaN(b.getTime()) || b <= a) return fmt.format(a);
  return fmt.formatRange(a, b);
}
