import { SLOTS, cellKey } from "@/lib/availability";
import type { Occurrence } from "./expand";
import { wallClock, zonedToUtc } from "./tz";

/**
 * Weekly-grid cells (day-of-week, 2-hour slot) that overlap a timed event, in the viewer's zone.
 * Only a hint: all-day events (birthdays, holidays) don't count as busy.
 */
export function busyCells(events: Occurrence[], tz: string): Set<string> {
  const busy = new Set<string>();
  for (const ev of events) {
    if (ev.all_day) continue;
    const s = Date.parse(ev.starts_at);
    const e = Date.parse(ev.ends_at);
    const first = wallClock(s, tz);
    const last = wallClock(Math.max(e - 1, s), tz);
    let day = Date.UTC(first.year, first.month - 1, first.day);
    const stop = Date.UTC(last.year, last.month - 1, last.day);
    for (; day <= stop; day += 86_400_000) {
      const d = new Date(day);
      const base = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), minute: 0, second: 0 };
      SLOTS.forEach((slot, i) => {
        const slotStart = zonedToUtc({ ...base, hour: Number(slot.start.slice(0, 2)) }, tz);
        const slotEnd = zonedToUtc({ ...base, hour: Number(slot.end.slice(0, 2)) }, tz);
        if (s < slotEnd && Math.max(e, s + 1) > slotStart) busy.add(cellKey(d.getUTCDay(), i));
      });
    }
  }
  return busy;
}
