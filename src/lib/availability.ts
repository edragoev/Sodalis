// Weekly availability as "[{ dow, start, end }]" (dow 0 = Sunday, 24h local times),
// the same shape as seniors.preferred_windows. The UI works in coarse blocks.
export type Window = { dow: number; start: string; end: string };

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const BLOCKS = [
  { label: "Morning", hint: "8–12", start: "08:00", end: "12:00" },
  { label: "Afternoon", hint: "12–5", start: "12:00", end: "17:00" },
  { label: "Evening", hint: "5–9", start: "17:00", end: "21:00" },
] as const;

export const cellKey = (dow: number, block: number) => `${dow}-${block}`;

/** Selected cells -> windows, merging touching blocks on the same day. */
export function toWindows(selected: Set<string>): Window[] {
  const out: Window[] = [];
  for (let dow = 0; dow < 7; dow++) {
    let current: Window | null = null;
    BLOCKS.forEach((b, i) => {
      if (!selected.has(cellKey(dow, i))) return void (current = null);
      if (current && current.end === b.start) current.end = b.end;
      else out.push((current = { dow, start: b.start, end: b.end }));
    });
  }
  return out;
}

/** Windows -> selected cells: a block counts when a window fully covers it. */
export function fromWindows(windows: unknown): Set<string> {
  const selected = new Set<string>();
  if (!Array.isArray(windows)) return selected;
  for (const w of windows as Partial<Window>[]) {
    if (typeof w?.dow !== "number" || typeof w.start !== "string" || typeof w.end !== "string") continue;
    BLOCKS.forEach((b, i) => {
      if (w.start! <= b.start && w.end! >= b.end) selected.add(cellKey(w.dow!, i));
    });
  }
  return selected;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Server-side check of a client-supplied list of windows. Returns an error message or null. */
export function validateWindows(windows: unknown): string | null {
  if (!Array.isArray(windows) || windows.length > 50) return "Availability must be a list of up to 50 windows.";
  for (const w of windows) {
    if (!Number.isInteger(w?.dow) || w.dow < 0 || w.dow > 6) return "Each window needs a day from 0 to 6.";
    if (typeof w.start !== "string" || typeof w.end !== "string" || !HHMM.test(w.start) || !HHMM.test(w.end)) {
      return "Window times must look like 09:00.";
    }
    if (w.start >= w.end) return "A window must end after it starts.";
  }
  return null;
}
