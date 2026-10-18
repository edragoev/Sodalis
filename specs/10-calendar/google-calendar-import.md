# Google Calendar Import (.ics / .zip)

**Version:** v2. An OAuth-free alternative to the [free/busy flow](../02-api/routes.md): a family member exports their Google Calendar and uploads it. The system parses it, normalizes it to UTC, and stores the events as native application data. This avoids the unverified-app warning and 100 test-user cap (see [risk 7](../05-product/decisions.md#risks)).

Pipeline: upload → detect type → (unzip in memory) → parse with an iCalendar library → normalize to UTC → upsert into `calendar_events` → serve via REST.

## 1. Frontend (upload interface)
- A file upload component (placed in `src/components/CalendarStep.tsx`, shown on `/calendar`) that accepts `.zip` and `.ics` only: `accept=".zip,.ics,text/calendar,application/zip"`.
- Client-side checks before upload: extension and a size cap matching the server (10 MB). These are for UX only; the server re-validates everything.
- Sends the file as `multipart/form-data` (`file`, `member_id`) in a `POST` to `/api/calendar/import`.
- States: idle, uploading, success (`N imported, M updated, K skipped`), error (message from the response). Show the first few per-event errors from `errors[]`.
- Google's export is a `.zip` containing one `.ics` per calendar. The helper text tells users to export from Google Takeout or Calendar settings → Import & export.

## 2. Backend (extraction and parsing)
- Endpoint: `POST /api/calendar/import` (Node runtime, not Edge). Writes use the service-role key, like the other routes.
- **Type detection by content, not extension or `Content-Type`:** `PK\x03\x04` = zip; text beginning with `BEGIN:VCALENDAR` = ics; anything else returns 415.
- **Zip handling is in memory only** (e.g. `fflate`). Nothing is written to disk and the upload is never persisted.
  - Take every entry ending in `.ics` (case-insensitive); ignore all others.
  - Zip-bomb guards: max 50 entries, max 50 MB total uncompressed, abort on exceeding either. Entry names are never used as paths.
- **Parsing uses an industry-standard iCalendar library** (e.g. `ical.js`). **Custom regex or hand-rolled string parsing of ICS is prohibited**: RFC 5545 has line folding, text escaping, property parameters, `VTIMEZONE` blocks and recurrence semantics that regexes get wrong.
- Per-event failures are collected in `errors[]` and do not abort the batch. A file with zero `VEVENT`s returns 422.

## 3. Data mapping and normalization
Only `VEVENT` components are read (`VTODO`, `VJOURNAL`, `VFREEBUSY` are ignored).

| ICS property | Column | Notes |
|---|---|---|
| `SUMMARY` | `title` | Empty becomes `(no title)` |
| `DTSTART` | `starts_at` | Normalized to UTC (below) |
| `DTEND` | `ends_at` | Normalized to UTC. If absent: `DTSTART + DURATION`; if both absent, same as start (all-day: +1 day) |
| `DESCRIPTION` | `notes` | Unescaped by the library; plain text |
| `RRULE` | `rrule` | Raw string stored as-is (see RRULE strategy) |
| `EXDATE` | `exdates` | Normalized to UTC |
| `UID` | `uid` | Identity for idempotent re-import |
| `RECURRENCE-ID` | `recurrence_id` | Marks an edited single instance of a series |

### UTC normalization (required)
Every `DTSTART` and `DTEND` is converted to a UTC instant **before** insertion and stored as `timestamptz`. No local-time value reaches the database.
- `DTSTART;TZID=...`: resolve with the file's `VTIMEZONE` (or the IANA name) using the library's timezone support, then convert to UTC.
- `...Z` values: already UTC.
- Floating times (no `Z`, no `TZID`): interpreted in the member's senior's `seniors.timezone`, then converted.
- All-day (`VALUE=DATE`): stored as the UTC instants of local midnight to the next local midnight in the source timezone, with `all_day = true`.
- The original zone is kept in `source_tz` (IANA name) so recurring events keep their local wall-clock time across DST changes.
- Unresolvable `TZID`: skip the event and add it to `errors[]`; never guess.

### RRULE strategy (decision)
**Store the raw `RRULE` and expand occurrences dynamically at read time. Do not expand into per-occurrence rows on import.**
- One row per series holds `rrule`, `exdates`, `source_tz`, `starts_at` and `ends_at` (the first instance, so duration = `ends_at - starts_at`).
- `GET /api/calendar/events?from&to` expands each series with the library's recurrence iterator, in `source_tz` (so DST is correct), applies `exdates`, and swaps in any `RECURRENCE-ID` exception rows for their instance.
- Expansion is bounded: window is at most 366 days and at most 2,000 occurrences per request.
- Why: `FREQ=DAILY` with no `UNTIL` is unbounded, so expanding on import would either explode the table or silently truncate. Stored occurrences also go stale when the series is edited. A single row per series makes re-import, deletion and `EXDATE` handling simple.
- Cost: reads do compute. Acceptable at this scale (one family, a few hundred series); revisit with caching only if measured slow.

## 4. Storage and integration
New table `calendar_events` (see also [schema](../01-database/schema.md)):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `member_id` | uuid → `family_members` | Owner |
| `uid` | text | From `UID` |
| `recurrence_id` | timestamptz, nullable | UTC of the overridden instance; null for series or one-off events |
| `title` | text | |
| `notes` | text, nullable | |
| `starts_at`, `ends_at` | timestamptz | UTC |
| `all_day` | bool | default false |
| `rrule` | text, nullable | Raw RRULE value |
| `exdates` | timestamptz[] | default `{}` |
| `source_tz` | text | IANA name |
| `source` | text | `'ics_import'` (leaves room for other sources) |
| `import_batch_id` | uuid | Groups one upload, for undo |
| `created_at` | timestamptz | |

- Unique `(member_id, uid, recurrence_id)` declared `NULLS NOT DISTINCT`: re-importing the same export upserts instead of duplicating.
- Index `(member_id, starts_at)`.
- Imported events are native data: queryable like any other table, and counted as busy intervals by `GET /api/availability/[memberId]` alongside the manual grid.
- **Scheduler:** `src/lib/scheduler/load.ts` reads the member's `calendar_events`, expands them for the next 8 days with `expandEvents` and adds the timed ones to `busyWindows` next to Google busy time, so `getSlots` never offers a slot over an uploaded event. All-day events are ignored, as in the weekly-grid hint. A read error is thrown, never read as "free".
- Writes only through the import route (service role). RLS is on with **no anon policy**: `notes` can hold personal or health details, so the table is read only through `GET /api/calendar/events`.

### REST API
| Route | Purpose |
|---|---|
| `POST /api/calendar/import` | Upload `.ics`/`.zip`. Returns `{ batch_id, imported, updated, skipped, errors: [{uid?, message}] }` |
| `GET /api/calendar/events?member_id&from&to` | Occurrences in the window (series expanded), each `{ id, uid, title, notes, starts_at, ends_at, all_day }` with UTC ISO-8601 timestamps |
| `DELETE /api/calendar/import/[batchId]?member_id=` | Removes everything from that upload (including rows it updated) |

Errors: 400 missing/invalid fields or unreadable file, 413 over size limit, 415 not an ics/zip, 422 no `VEVENT`s found, 404 unknown member.

## 5. Where it shows up
On the Availability page (`/availability`), below the weekly grid, a "Your calendar" section replaces the public embed there:
- An **Upload calendar** button (and **Remove imported calendar** once something is imported; the last batch id is kept in the browser).
- A **month calendar** with a dot on days that have events; tapping a day lists its events in the viewer's local time.
- **Busy hints in the weekly grid:** a small dot on any 2-hour cell that overlaps a timed event in the next 7 days. It is a hint only; it never unticks a cell, and all-day events don't count.

## 6. Privacy and security
- The uploaded file is processed in memory and discarded. Do not log event titles, notes or file contents.
- Verify `member_id` exists. (No auth in the demo; same caveat as the other routes.)
- Enforce limits before parsing: body size, zip entry count and uncompressed size.

## 7. Tests
Vitest, in the existing layout (`tests/unit/` for parsing/normalization, `tests/api/` for the route). Fixtures:
- `TZID` with `VTIMEZONE`, a `Z` time, and a floating time: all end up as the expected UTC instants.
- All-day event; event with `DURATION` instead of `DTEND`.
- `RRULE` with `EXDATE`, an edited instance (`RECURRENCE-ID`), and a DST boundary.
- Folded lines and escaped characters in `DESCRIPTION`.
- Zip with several `.ics` plus unrelated files; malformed `.ics`; zip over the entry/size limits; wrong file type.
- Re-importing the same file produces `updated`, not duplicates.
