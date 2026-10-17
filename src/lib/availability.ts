// Weekly availability as "[{ dow, start, end }]" (dow 0 = Sunday, 24h local times),
// the same shape as seniors.preferred_windows. The UI works in 2-hour slots: that is how long a
// visit lasts, so a ticked slot is a time a visit can really start. A call fits inside any slot.
export type Window = { dow: number; start: string; end: string };

export const DAY_LETTERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number) => String(n).padStart(2, "0");
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;

/** 8-10 am, 10-12, 12-2 pm, ... 8-10 pm. */
export const SLOTS = Array.from({ length: 7 }, (_, i) => {
  const h = 8 + i * 2;
  return { label: hourLabel(h), range: `${hourLabel(h)} to ${hourLabel(h + 2)}`, start: `${pad(h)}:00`, end: `${pad(h + 2)}:00` };
});

export const cellKey = (dow: number, slot: number) => `${dow}-${slot}`;
export const dayKeys = (dow: number) => SLOTS.map((_, i) => cellKey(dow, i));
export const slotKeys = (slot: number) => DAY_LETTERS.map((_, d) => cellKey(d, slot));

/** Selected cells -> windows, merging touching slots on the same day. */
export function toWindows(selected: Set<string>): Window[] {
  const out: Window[] = [];
  for (let dow = 0; dow < 7; dow++) {
    let current: Window | null = null;
    SLOTS.forEach((s, i) => {
      if (!selected.has(cellKey(dow, i))) return void (current = null);
      if (current && current.end === s.start) current.end = s.end;
      else out.push((current = { dow, start: s.start, end: s.end }));
    });
  }
  return out;
}

/**
 * Windows -> selected cells. A slot counts only when a window fully covers it, so older, wider
 * windows never claim time that wasn't offered.
 */
export function fromWindows(windows: unknown): Set<string> {
  const selected = new Set<string>();
  if (!Array.isArray(windows)) return selected;
  for (const w of windows as Partial<Window>[]) {
    if (typeof w?.dow !== "number" || typeof w.start !== "string" || typeof w.end !== "string") continue;
    SLOTS.forEach((s, i) => {
      if (w.start! <= s.start && w.end! >= s.end) selected.add(cellKey(w.dow!, i));
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
