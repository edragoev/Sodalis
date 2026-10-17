# Supabase Schema

All ids are `uuid`. Timestamps are `timestamptz`.

| Table | Key columns |
|---|---|
| `seniors` | id, name, phone_e164, timezone, `preferred_windows jsonb` (weekly `[{dow, start, end}]`), `hope_call_windows jsonb`, notes (interests, health context fed to Hope) |
| `family_members` | id, senior_id→seniors, name, relationship, phone, `fcm_token`, `google_refresh_token`, `manual_availability jsonb`, `calendar_connected bool` |
| `check_ins` | id, senior_id, `vapi_call_id` UNIQUE (idempotency), `started_at`, ended_at, duration_s, status (completed/no_answer/failed), transcript, summary, `mood_score` (-1..1), mood_label, `topics text[]`, `engagement_score` (0..1), `flags jsonb`, `raw_extraction jsonb` |
| `call_requests` | id, senior_id, check_in_id, `target_member_id` (nullable = anyone), reason, urgency, status (pending/accepted/declined/done), accepted_by, created_at |
| `alerts` | id, senior_id, check_in_id, type (low_mood/health/missed_checkin/wants_contact), severity (info/warn/urgent), message, acknowledged_by, created_at |
| `visits` | id, senior_id, member_id, kind (visit/call), `starts_at`, ends_at, status (proposed/confirmed/completed/cancelled), score, `score_breakdown jsonb`, call_request_id, `outcome_engagement` |
| `hope_calls` (fixed-cadence queue, not scheduler output) | id, senior_id, scheduled_for, status (scheduled/dialed/answered/missed), attempt, vapi_call_id |

## Conversation-driven visits
| Table / column | Notes |
|---|---|
| `opportunities` | id, senior_id, check_in_id, type (gift_errand/activity/event/wants_contact), summary, quote, `mentioned_member_id` (nullable), mentioned_item, `interest_tags text[]`, target_date, urgency, confidence, suggested_kind, `notified_member_ids uuid[]`, `proposed_slots jsonb`, status (detected/proposed/confirmed/declined/expired), accepted_by, created_at |
| `family_members.interests`, `.skills` | `text[]`, used to match opportunities to members |
| `visits.opportunity_id` | nullable FK to `opportunities` |

Enable realtime on `opportunities`. See [conversation-to-visit](../06-notifications/conversation-to-visit.md).

## Member profiles (questionnaire)
| Table / column | Notes |
|---|---|
| `member_profile_answers` | id, member_id→family_members, `question_key` (with_elder/interests/skills/talk_about/wish/logistics), answer_text, updated_at; unique (member_id, question_key) |
| `family_members.interests`, `.skills`, `.activities_with_elder`, `.conversation_topics` | `text[]`, structured by Gemini from the answers; member-editable |
| `family_members.constraints` | `jsonb` `{can_drive, travel_minutes, notes}` |
| `family_members.profile_summary`, `.profile_updated_at` | one-line summary and timestamp |

See [member-questionnaire](../07-onboarding/member-questionnaire.md).

## Phone linking
- `seniors.phone_e164` is UNIQUE (the lookup key for family linking and the Vapi webhook).
- `family_members.joined_at`; unique `(senior_id, lower(name))`. Members are created through phone linking, not pre-seeded.
- See [family-linking](../07-onboarding/family-linking.md).

## Agents
| Table / column | Notes |
|---|---|
| `opportunities.source` | `extraction` or `hope_tool` |
| `opportunities.check_in_vapi_call_id` | set by Hope's `propose_visit` before the check-in row exists; used for dedup |
| `hope_calls.availability_cache` | `jsonb`, per-member free slots computed before dialing (v2) |
| `agent_runs` | id, opportunity_id, step, tool, args `jsonb`, result `jsonb`, model_text, used_fallback bool, created_at (v1: one row per run with input/output; v2: one row per step) |

Enable realtime on `agent_runs` for the dashboard trace. See [hope-tools](../08-agents/hope-tools.md) and [coordinator-agent](../08-agents/coordinator-agent.md).

## v1 seed
The elder plus 4 family members (Danny, Maya, Sam, Lena) with `relationship`, tags, `profile_summary` and `manual_availability`. Unused in v1: `google_refresh_token`, `calendar_connected`, `member_profile_answers`, `hope_calls.availability_cache`.

## Indexes
- `check_ins (senior_id, started_at DESC)` (required)
- `visits (senior_id, starts_at)`
- `alerts (senior_id, created_at DESC)`
- `call_requests (status) WHERE status = 'pending'`

## Realtime
Enable on `call_requests`, `check_ins`, `alerts`, `visits` (add to the `supabase_realtime` publication). The dashboard subscribes with the anon key.

## Security (no auth)
- All writes go through Next.js API routes using the service-role key (server only).
- Anon key gets SELECT-only RLS policies (needed for realtime).
- Demo only: use fake seeded data. The FCM token write goes through `POST /api/push/register`.
