import ICAL from "ical.js";
import { unzipSync } from "fflate";
import { Wall, isValidTimeZone, zonedToUtc } from "./tz";

// Parsing of a Google Calendar export (.ics, or a .zip of them). All ICS parsing goes through
// ical.js; never hand-parse ICS text (line folding, escaping, parameters, VTIMEZONE).

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 50;
export const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;

export type CalendarRow = {
  uid: string;
  recurrence_id: string | null;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  rrule: string | null;
  exdates: string[];
  source_tz: string;
};

export type ParseResult = { rows: CalendarRow[]; errors: { uid?: string; message: string }[] };

export class ImportError extends Error {
  constructor(message: string, readonly status: 400 | 413 | 415 | 422) {
    super(message);
  }
}

/** Decides by content, not by file name or Content-Type. */
export function detectType(bytes: Uint8Array): "zip" | "ics" | null {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) return "zip";
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).replace(/^﻿/, "").trimStart();
  return head.slice(0, 15).toUpperCase() === "BEGIN:VCALENDAR" ? "ics" : null;
}

/** Returns the text of every .ics inside a zip, in memory, within the entry and size limits. */
export function extractIcs(zip: Uint8Array): string[] {
  let entries = 0;
  let declared = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, {
      filter(file) {
        if (++entries > MAX_ZIP_ENTRIES) throw new ImportError("The zip has too many files.", 413);
        if (!file.name.toLowerCase().endsWith(".ics")) return false;
        declared += file.originalSize;
        if (declared > MAX_UNZIPPED_BYTES) throw new ImportError("The zip is too large once unpacked.", 413);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("Couldn't read that zip file.", 400);
  }
  let actual = 0;
  const out: string[] = [];
  for (const data of Object.values(files)) {
    actual += data.length;
    if (actual > MAX_UNZIPPED_BYTES) throw new ImportError("The zip is too large once unpacked.", 413);
    out.push(new TextDecoder().decode(data));
  }
  if (!out.length) throw new ImportError("No .ics calendar found in the zip.", 422);
  return out;
}

function wallOf(t: ICAL.Time): Wall {
  return { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second };
}

/**
 * One DTSTART/DTEND/EXDATE value as a UTC instant plus the zone it was written in.
 * Z -> as is. TZID (IANA) -> converted with Intl. Floating or all-day -> the fallback zone.
 * A TZID that is not IANA falls back to the file's VTIMEZONE; the recurrence then runs in UTC.
 */
function toUtc(prop: ICAL.Property, t: ICAL.Time, fallbackTz: string): { ms: number; tz: string } {
  const tzid = prop.getParameter("tzid") as string | undefined;
  if (t.isDate) return { ms: zonedToUtc(wallOf(t), fallbackTz), tz: fallbackTz };
  if (tzid) {
    if (isValidTimeZone(tzid)) return { ms: zonedToUtc(wallOf(t), tzid), tz: tzid };
    if (ICAL.TimezoneService.has(tzid)) return { ms: t.toJSDate().getTime(), tz: "UTC" };
    throw new Error(`Unknown time zone "${tzid}"`);
  }
  if (t.zone === ICAL.Timezone.utcTimezone) return { ms: t.toJSDate().getTime(), tz: "UTC" };
  return { ms: zonedToUtc(wallOf(t), fallbackTz), tz: fallbackTz };
}

const iso = (ms: number) => new Date(ms).toISOString();

export function parseIcs(text: string, fallbackTz: string): ParseResult {
  const rows: CalendarRow[] = [];
  const errors: ParseResult["errors"] = [];
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    return { rows, errors: [{ message: "Couldn't read a calendar in the file." }] };
  }
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {}
  }

  for (const v of root.getAllSubcomponents("vevent")) {
    const uid = String(v.getFirstPropertyValue("uid") ?? "");
    try {
      if (!uid) throw new Error("Event has no UID");
      if (String(v.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;

      const startProp = v.getFirstProperty("dtstart");
      const startVal = startProp?.getFirstValue() as ICAL.Time | undefined;
      if (!startProp || !startVal) throw new Error("Event has no start time");
      const start = toUtc(startProp, startVal, fallbackTz);

      let endMs: number;
      const endProp = v.getFirstProperty("dtend");
      const duration = v.getFirstPropertyValue("duration") as ICAL.Duration | null;
      if (endProp) endMs = toUtc(endProp, endProp.getFirstValue() as ICAL.Time, fallbackTz).ms;
      else if (duration) endMs = start.ms + duration.toSeconds() * 1000;
      else if (startVal.isDate) endMs = zonedToUtc({ ...wallOf(startVal), day: startVal.day + 1 }, fallbackTz);
      else endMs = start.ms;
      if (endMs < start.ms) endMs = start.ms;

      const rid = v.getFirstProperty("recurrence-id");
      const ridVal = rid?.getFirstValue() as ICAL.Time | undefined;
      const exdates: string[] = [];
      for (const p of v.getAllProperties("exdate")) {
        for (const val of p.getValues() as ICAL.Time[]) exdates.push(iso(toUtc(p, val, fallbackTz).ms));
      }
      const rule = v.getFirstPropertyValue("rrule") as ICAL.Recur | null;

      rows.push({
        uid,
        recurrence_id: rid && ridVal ? iso(toUtc(rid, ridVal, fallbackTz).ms) : null,
        title: String(v.getFirstPropertyValue("summary") ?? "").trim() || "(no title)",
        notes: String(v.getFirstPropertyValue("description") ?? "").trim() || null,
        starts_at: iso(start.ms),
        ends_at: iso(endMs),
        all_day: !!startVal.isDate,
        rrule: rule ? rule.toString() : null,
        exdates,
        source_tz: start.tz,
      });
    } catch (e) {
      errors.push({ uid: uid || undefined, message: e instanceof Error ? e.message : "Couldn't read this event" });
    }
  }
  return { rows, errors };
}

/** Bytes of an upload -> rows. Throws ImportError with the HTTP status the route should return. */
export function parseUpload(bytes: Uint8Array, fallbackTz: string): ParseResult {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new ImportError("That file is too large (10 MB max).", 413);
  const kind = detectType(bytes);
  if (!kind) throw new ImportError("Upload a .ics file or a .zip of one.", 415);
  const texts = kind === "zip" ? extractIcs(bytes) : [new TextDecoder().decode(bytes)];
  const merged: ParseResult = { rows: [], errors: [] };
  for (const text of texts) {
    const r = parseIcs(text, fallbackTz);
    merged.rows.push(...r.rows);
    merged.errors.push(...r.errors);
  }
  if (!merged.rows.length && !merged.errors.length) throw new ImportError("No events found in that file.", 422);
  return merged;
}
