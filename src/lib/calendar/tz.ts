// Time zone helpers built on Intl, so any IANA zone works without a VTIMEZONE block.

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** The local wall-clock reading of a UTC instant in a zone. */
export function wallClock(ms: number, tz: string): Wall {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(new Date(ms))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

const wallAsUtc = (w: Wall) => Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);

/** Milliseconds the zone is ahead of UTC at an instant. */
function offsetMs(ms: number, tz: string) {
  return wallAsUtc(wallClock(ms, tz)) - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant at which a zone's clock reads the given wall time (a skipped DST hour moves forward). */
export function zonedToUtc(w: Wall, tz: string): number {
  const guess = wallAsUtc(w);
  const first = guess - offsetMs(guess, tz);
  const second = guess - offsetMs(first, tz);
  return second;
}
