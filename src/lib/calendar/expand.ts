import ICAL from "ical.js";
import type { CalendarRow } from "./import";
import { Wall, wallClock, zonedToUtc } from "./tz";

// A recurring series is stored once, with its raw RRULE, and expanded here when read.
export const MAX_WINDOW_DAYS = 366;
export const MAX_OCCURRENCES = 2000;
const MAX_ITERATIONS = 50_000;

export type Occurrence = {
  id: string;
  uid: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

type Row = CalendarRow & { id: string };

const toTime = (w: Wall) => ICAL.Time.fromData({ ...w });

/** Occurrences overlapping [from, to), series expanded in their own zone so DST keeps wall-clock time. */
export function expandEvents(rows: Row[], from: Date, to: Date): Occurrence[] {
  const f = from.getTime();
  const t = to.getTime();
  const out: Occurrence[] = [];
  const overridden = new Set(rows.filter((r) => r.recurrence_id).map((r) => `${r.uid}|${Date.parse(r.recurrence_id!)}`));

  const push = (r: Row, s: number, e: number) => {
    if (out.length < MAX_OCCURRENCES && s < t && Math.max(e, s) >= f && (e > s ? e > f : s >= f)) {
      out.push({ id: `${r.id}@${s}`, uid: r.uid, title: r.title, notes: r.notes, starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString(), all_day: r.all_day });
    }
  };

  for (const r of rows) {
    const start = Date.parse(r.starts_at);
    const dur = Date.parse(r.ends_at) - start;
    if (!r.rrule || r.recurrence_id) {
      push(r, start, start + dur);
      continue;
    }
    try {
      const skip = new Set(r.exdates.map((d) => Date.parse(d)));
      const recur = ICAL.Recur.fromString(r.rrule);
      // The iterator works on wall-clock times; an UNTIL given in UTC is moved to the series' zone.
      if (recur.until && !recur.until.isDate) recur.until = toTime(wallClock(recur.until.toJSDate().getTime(), r.source_tz));
      const it = recur.iterator(toTime(wallClock(start, r.source_tz)));
      for (let n = 0, next = it.next(); next && n < MAX_ITERATIONS; n++, next = it.next()) {
        const s = zonedToUtc({ year: next.year, month: next.month, day: next.day, hour: next.hour, minute: next.minute, second: next.second }, r.source_tz);
        if (s >= t) break;
        if (skip.has(s) || overridden.has(`${r.uid}|${s}`)) continue;
        push(r, s, s + dur);
        if (out.length >= MAX_OCCURRENCES) break;
      }
    } catch {
      push(r, start, start + dur); // an unreadable rule still shows its first instance
    }
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
