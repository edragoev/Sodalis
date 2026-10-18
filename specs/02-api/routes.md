# API Routes (Next.js App Router)

| Route | Version | Purpose |
|---|---|---|
| `POST /api/vapi/webhook` | v1 | Receives Vapi server messages; handles `end-of-call-report` |
| `POST /api/schedule/plan` | v2 | Scheduling math for a horizon (default 14 days); returns proposed family `visits` (visit or call) only |
| `POST /api/schedule/confirm` | v1 | Member confirms a slot (from `/opportunities/[id]`); first accept wins; status becomes `confirmed`; push to others |
| `GET /api/cron/hope-calls` | v2 | Vercel Cron every 5-15 min; dials due `hope_calls` via Vapi; retry after 30 min, max 2, then `missed_checkin` alert |
| `GET /api/auth/google` + `/callback` | v2 | Per-member Google Calendar OAuth (free/busy scope); stores refresh token |
| `GET /api/availability/[memberId]` | v2 | Busy intervals from Google, or the manual grid |
| `POST /api/calendar/import` | v2 | Uploads a Google Calendar `.ics`/`.zip` export; parses, normalizes to UTC, upserts `calendar_events`. See [google-calendar-import](../10-calendar/google-calendar-import.md) |
| `GET /api/calendar/events` | v2 | Imported events for a member and window; recurring series expanded at read time |
| `DELETE /api/calendar/import/[batchId]` | v2 | Removes all events from one import |
| `POST /api/push/register` | v1 | Stores a member's FCM token |
| `POST /api/push/test` | v1 | Sends a test push to the current member (FCM hello world) |
| `POST /api/call-requests/[id]/accept` | v2 | Member claims a request; triggers scheduling of the next slot |
| `POST /api/hope/call-now` | v1 | On-demand outbound Hope call (demo trigger) |
| `POST /api/link/lookup` | v2 | Finds the elder by phone number; returns only the first name |
| `POST /api/link/join` | v2 | Creates or reconnects a family member for that elder |
| `POST /api/link/elders` | v2 | Demo-only: creates a new elder. See [family-linking](../07-onboarding/family-linking.md) |
| `GET /api/members/[id]/profile` | v2 | Returns questionnaire answers and structured tags |
| `PUT /api/members/[id]/profile` | v2 | Saves answers, re-runs Gemini structuring, returns tags |
| `PUT /api/members/[id]/tags` | v2 | Manual tag edits (override Gemini) |
| `POST /api/vapi/tools` | v1 | Hope's in-call `flag_concern` tool call (`tool-calls` messages), for health concerns only. See [hope-tools](../08-agents/hope-tools.md) |
| `POST /api/agent/coordinate` | v1 | Runs the coordinator for an opportunity (v1: one Gemini call). See [coordinator-agent](../08-agents/coordinator-agent.md) |

## Webhook flow: `end-of-call-report`
1. Verify the shared-secret header from Vapi; reject if missing.
2. Read `message.type`; return 200 immediately for other types.
3. Idempotency: check `call.id` against `check_ins.vapi_call_id`.
4. Pull `message.artifact.transcript`, `message.summary`, `startedAt`, `endedAt`, `endedReason`. Map senior by `call.customer.number`.
5. Voicemail/no-answer: insert `no_answer` check-in and stop (retry scheduling is v2).
6. Call Gemini Flash with the structured schema (see 03-ai). Retry once, then fall back to a minimal row so the call is never lost.
7. Insert `check_ins`; insert `alerts` for fired flags; insert a `wants_contact` opportunity if `wants_family_contact`; update engagement aggregates. Skip extracted health alerts that `flag_concern` already raised during the call; start the coordinator for every extracted opportunity.
8. FCM multicast to members with tokens; urgent alerts high priority.
9. `export const maxDuration = 30`; if Gemini is slow, return 200 and finish with `after()`.
