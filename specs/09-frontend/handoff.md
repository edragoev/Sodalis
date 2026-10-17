# Frontend Handoff: What the Web App Needs From the Team

Branch: `frontend`. Everything below is built and pushed there. The app builds, typechecks, and its unit tests pass.

## 1. Please do these (blocking or near-blocking)

| # | Who | What | Why it matters |
|---|---|---|---|
| 1 | Whoever owns Gemini | Share `GEMINI_API_KEY` and the model name (`GEMINI_MODEL`). Add both to `.env.local` and Vercel. **Use `gemini-3.8-flash`** (or `gemini-flash-latest`). On a new free-tier key, `gemini-2.5-flash` returns 404 "no longer available to new users", so any code still using that name (including Hope's call extraction) will fail. | Questionnaire tags can't generate without them. Answers still save. |
| 2 | Database owner | Apply migrations `20261017000500_member_pronouns.sql` (yours) and `20261017000600_senior_pronouns.sql` (mine) to the hosted project. | Neither pronouns column exists on the hosted DB yet. Sign-up still works (it falls back) but pronouns are not saved. |
| 3 | Database owner | Turn on realtime for `check_ins`, `alerts`, `call_requests`, `visits` and `opportunities`. | The dashboard only live-updates with it. Without it, it updates on refresh. |
| 4 | Database owner | Check the hosted DB matches the migrations. Example: hosted `seniors.timezone` is NOT NULL with no default, but the migration gives it `default 'UTC'`. | Inserts that omit `timezone` fail on hosted but pass locally. |
| 5 | Webhook owner | Write `check_ins`, `alerts` and `call_requests` rows, and `opportunities` with `status = 'proposed'`. | The dashboard reads these. Until then it only shows seed data. |
| 6 | Everyone | Run `supabase/seed-demo.sql` in the Supabase SQL editor. | Gives the demo elder (Margaret, `(415) 555-0100`) with calls, an alert, a call request and an idea. Safe to re-run. |

## 2. Agree on these formats

**Opportunity slots (`opportunities.proposed_slots`)**: the spec never defined this, so the frontend reads:
```json
[{ "id": "s1", "starts_at": "2026-10-18T16:00:00Z", "ends_at": "2026-10-18T18:00:00Z", "kind": "visit", "member_id": "<uuid or null>" }]
```
- `id` must be unique within one opportunity. `ends_at`, `kind` and `member_id` are optional.
- A slot with a `member_id` can only be confirmed by that member.
- Missing `ends_at` defaults to +2 h for a visit, +30 min for a call.
- The status must be `proposed` for the screen to offer confirming. `detected` can't be confirmed.

**Member availability (`family_members.manual_availability`)**:
```json
[{ "dow": 1, "start": "17:00", "end": "21:00" }]
```
- `dow` 0 = Sunday. 24 h times in the member's local time. No time zone is stored. Same shape as `seniors.preferred_windows`.
- The UI works in blocks: Morning 08:00-12:00, Afternoon 12:00-17:00, Evening 17:00-21:00. Touching blocks merge into one window.
- If the scheduler needs 30-minute precision or a time zone, tell the frontend.

**Call transcripts**: the call screen expects lines like `AI: ...` and `User: ...` (it also accepts `Assistant`, `Hope`, `Customer`, `Caller`). Anything else shows as plain lines.

**Call flags (`check_ins.flags`)**: read exactly as the extraction schema in `specs/03-ai/hope-persona.md`: `health_concern`, `safety_concern`, `wants_family_contact` (objects with `present`, `detail`, `severity`, `who`, `reason`), plus the booleans `low_mood` and `confusion_or_memory`. Follow-up topics are read from `raw_extraction.follow_up_topics`.

## 3. Open questions for the team

1. **Google Calendar via MCP:** how does a family member connect it? Which endpoint should the frontend call to start the connection and to check whether it's connected? Where is the result stored (`family_members.calendar_connected`)? The onboarding step shows "Connect Google Calendar - Coming soon" until this is answered. The manual grid is the working fallback.
2. **Pronouns in Hope's prompt:** the elder's pronouns are in `seniors.pronouns`, a member's in `family_members.pronouns`. Null means they/them. Hope and the notification text should use them.
3. **`agent_runs`:** the table doesn't exist on the hosted DB yet. The opportunity screen has no "why you" line until it does.
4. **Push on confirm:** `POST /api/schedule/confirm` does not notify the other members yet. The Firebase helper in `src/lib/firebase/` could be called from there.
5. **Anon read access:** the anon key can read `family_members` (including optional phone numbers) and the questionnaire answers. Is that intended for the demo? Any column added to `family_members` later must be granted to anon if the frontend needs it.
6. **Phone-number-only sign-up:** anyone who knows the elder's number can join. Invite links exist (below), and the phone path is still allowed. Should the phone path be closed once links work?

## 4. Changes the frontend made that affect everyone

- **Gemini free tier:** rate limits are low, so avoid hammering Save during the demo. The profile view retries structuring if a call failed. Google may use free-tier content to improve its products, so use fake data only.
- **Repo layout:** all app code lives in `src/` (`src/app`, `src/lib`, `src/components`). A root `app/` folder shadows `src/app` and breaks the build. `@/` points at `src/`. The earlier root `app/`, `lib/` and `utils/` code was moved in, and the team's own fix on `main` made the same move.
- **Tests:** `tests/` is excluded from the app's `tsconfig.json`, and the Vitest `@` alias points at `src/`.
- **Lint:** `tests/helpers/route.ts` has 3 `no-explicit-any` errors. They don't affect the build.
- **Invite links:** `/join/<token>` tokens are signed with `INVITE_SECRET`, falling back to `SUPABASE_SERVICE_ROLE_KEY`. Rotating that key invalidates old links. Links can't be revoked individually.
- **Hosting:** the live site builds from the fork `nishthad-maker/CareChain`. After merging, the fork needs "Sync fork" on GitHub for Vercel to redeploy.
- **Vercel env vars needed:** `NEXT_PUBLIC_SUPABASE_URL` (no trailing slash), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEFAULT_PHONE_REGION=US`, and later `GEMINI_API_KEY` and `GEMINI_MODEL`. Redeploy after changing any.
- **Security:** the service-role key was shared in chat during setup. Rotate it in Supabase after the hackathon.

## 5. Screens and routes added

| Screen | Route | Notes |
|---|---|---|
| Sign-up | `/` | Part 1: loved one's phone, plus name and pronouns if new. Part 2: your name, pronouns, relationship. |
| Invite join | `/join/[token]` | Name, pronouns, relationship. |
| Questionnaire | `/questionnaire` | 6 free-text questions, Skip on each. |
| Calendar step | `/calendar` | Optional step. Google Calendar greyed out. |
| Dashboard | `/dashboard` | Alerts, mood trend, call requests, ideas, upcoming, recent calls, invite card. |
| Call detail | `/calls/[id]` | Mood, summary, flags, follow-ups, transcript. |
| Idea / visit proposal | `/opportunities/[id]` | Quote, slots, Confirm. This is the page a push should open. |
| Availability | `/availability` | Weekly grid. |
| Profile | `/profile` | Answers and editable tag chips. |

| API route | Purpose |
|---|---|
| `POST /api/link/lookup`, `/api/link/join`, `/api/link/elders` | Phone linking. Lookup returns only the first name. |
| `GET /api/link/invite?member_id=` | Returns a signed invite token for that member's family. |
| `GET /api/invite/[token]`, `POST /api/invite/join` | Resolve an invite and join through it. |
| `GET/PUT /api/members/[id]/profile`, `PUT .../tags` | Questionnaire answers and tags (Gemini structuring). |
| `GET/PUT /api/members/[id]/availability` | Weekly availability. |
| `POST /api/schedule/confirm` | First accept wins. Atomic claim, then creates the `visits` row. |

## 6. Not built yet

- Push-permission screen and registration (needs Firebase web config and the service account).
- Accept action on call requests (`POST /api/call-requests/[id]/accept`, v2 in the routes spec).
- Alert acknowledge button.
- Google Calendar connection.
- Visit detail and cancel screen.
- Deep links that survive sign-in: opening a push link while signed out loses the link.
- "Remove me" from a family circle.
