# Frontend Handoff: State of the Web App and What It Needs From the Team

Everything here is on `main`. The app builds and typechecks, and the unit tests pass except `vapi-webhook.test.ts`, which is a red test waiting for its implementation (`@/lib/vapi/webhook` does not exist yet).

## 1. How the app works now

```
Phone number
 ├─ found ───────────▶ Profile picker: "Who's checking in on Margaret?" (Netflix-style tiles)
 └─ not found ─▶ Set up the loved one: name, pronouns, birthday ─▶ interests, skills, good to know ─▶ picker

Profile picker
 ├─ tap an existing profile ─▶ dashboard (their questionnaire first if they never answered it)
 └─ "+ Add profile" ─▶ name, pronouns, relationship ─▶ questionnaire ─▶ calendar step (skippable) ─▶ dashboard
Invite link /join/<token> ─▶ name, pronouns, relationship ─▶ questionnaire
```
- The device remembers the family (`sodalis.elder` in localStorage) and the chosen profile (`sodalis.session`). Signed in opens the dashboard; "Switch profile" returns to the picker.
- The loved one is only created at the end of setup, so quitting halfway leaves nothing behind.
- Anyone with the elder's phone number can see the family's first names and relationships in the picker. That is the accepted no-auth trade-off for the demo (fake data only).

## 2. Please do these (blocking or near-blocking)

| # | Who | What | Why it matters |
|---|---|---|---|
| 1 | Database owner | Apply these migrations to the hosted project, in order: `000500_member_pronouns`, `000600_visits_confirm`, `000700_senior_pronouns`, `000800_senior_profile`. **Caveat for 000600:** it starts with `create table visits`, but the hosted DB already has a `visits` table, so run only the unique index and the `confirm_opportunity_slot` function from it. | Without `confirm_opportunity_slot`, confirming a visit returns an error (checked: the function is missing on hosted). Without 000500/000700/000800, pronouns, birthday, interests and skills are not saved (the app falls back to saving what it can). |
| 2 | Database owner | Check the hosted DB matches the migrations. Example: hosted `seniors.timezone` is NOT NULL with no default, but the migration gives it `default 'UTC'`. | Inserts that omit `timezone` fail on hosted but pass locally. |
| 3 | Database owner | Turn on realtime for `check_ins`, `alerts`, `call_requests`, `visits` and `opportunities`. | The dashboard only live-updates with it; otherwise it updates on refresh. |
| 4 | Everyone | Run `supabase/seed-demo.sql`, then (after the migrations) `supabase/seed-demo-elder-profile.sql`, in the Supabase SQL editor. Both are safe to re-run. | Gives the demo elder (Margaret, `(415) 555-0100`) with calls, an alert, a call request, an idea with slots, and her profile. |
| 5 | Webhook owner | Write `check_ins`, `alerts` and `call_requests` rows, and `opportunities` with `status = 'proposed'`. | The dashboard reads these. Until then it only shows seed data. |
| 6 | Whoever hosts | In Vercel add: `NEXT_PUBLIC_SUPABASE_URL` (no trailing slash), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEFAULT_PHONE_REGION=US`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.8-flash`, plus the Firebase variables. Redeploy after changing any. | Variables only apply on a new deploy. |
| 7 | Everyone using Gemini | Use **`gemini-3.8-flash`** (or `gemini-flash-latest`). On a new free-tier key `gemini-2.5-flash` returns 404 "no longer available to new users", so any code still using that name, including Hope's call extraction, will fail. | Questionnaire tags and call extraction. |
| 8 | Fork owner | The live site builds from the fork `nishthad-maker/CareChain`. After changes land on `edragoev/CareChain`, click "Sync fork" so Vercel redeploys. | The live link only updates after the sync. |

## 3. Formats the frontend relies on

**Opportunity slots (`opportunities.proposed_slots`)**: `[{ "id": "s1", "starts_at": "2026-10-18T16:00:00Z" }]`. Times are shown in the elder's time zone (`formatSlot`). `confirm_opportunity_slot` computes the end (1 h for a visit, 30 min for a call). The status must be `proposed` for the screen to offer confirming.

**Member availability (`family_members.manual_availability`)**: `[{ "dow": 1, "start": "17:00", "end": "21:00" }]`. `dow` 0 = Sunday, 24 h times in the member's local time, no time zone stored, same shape as `seniors.preferred_windows`. The UI works in blocks (Morning 08:00-12:00, Afternoon 12:00-17:00, Evening 17:00-21:00) and merges touching blocks. Tell the frontend if the scheduler needs finer precision or a time zone.

**Elder profile (`seniors`)**: `pronouns` (text), `birthday` (date), `interests` and `skills` (lowercase text tags), `notes` (the free-text "good to know"). Hope and the coordinator can read all of these.

**Member travel facts (`family_members.constraints`)**: questionnaire question 6 is now taps, not typing. It fills `constraints` exactly: `can_drive` (true/false/null), `travel_minutes` (an upper bound: 15, 30, 60, or 90 meaning more than an hour; null for "can only call or video") and `notes`. These are written when the answer is saved, so they survive a Gemini failure, and Gemini does not overwrite them. Older free-text answers still go through Gemini. The stored answer is a sentence such as `Getting there: I drive. Distance: 15 to 30 min. Note: weekends only`.

**Call transcripts**: the call screen expects lines such as `AI: ...` and `User: ...` (also `Assistant`, `Hope`, `Customer`, `Caller`). Anything else shows as plain lines.

**Call flags (`check_ins.flags`)**: read as in `specs/03-ai/hope-persona.md`: `health_concern`, `safety_concern`, `wants_family_contact` (objects with `present`, `detail`, `severity`, `who`, `reason`) and the booleans `low_mood` and `confusion_or_memory`. Follow-ups come from `raw_extraction.follow_up_topics`.

## 4. Open questions for the team

1. **Google Calendar via MCP:** how does a family member connect it, which endpoint should the frontend call to start it and to check whether it is connected, and where is the result stored (`family_members.calendar_connected`)? The onboarding step shows "Connect Google Calendar - Coming soon" until this is answered. The manual grid is the working fallback.
2. **Pronouns in Hope's prompt:** the elder's are in `seniors.pronouns`, a member's in `family_members.pronouns`. Null means they/them. Hope and notification text should use them.
3. **`agent_runs`** does not exist on the hosted DB yet, so there is no "why you" line on the opportunity screen.
4. **Push on confirm:** `POST /api/schedule/confirm` does not notify the other members yet. `pushToMembers` in `src/lib/firebase/` could be called from there.
5. **Anon read access:** the anon key can read `family_members` (including optional phone numbers) and the questionnaire answers. Is that intended for the demo? Any column later added to `family_members` must be granted to anon if the frontend needs it.
6. **Phone-number-only access:** the picker needs only the elder's number. Invite links exist for joining. Should the picker require an invite later?

## 5. Changes that affect everyone

- **Layout:** all app code lives in `src/` (`src/app`, `src/lib`, `src/components`); a root `app/` folder would shadow `src/app` and break the build. `@/` points at `src/`. Tests are excluded from the app's `tsconfig.json`, and the Vitest `@` alias points at `src/`.
- **Palette (sampled from the approved design):** buttons and the logo tile `#B0CDE6` with navy `#1D3B57` text, steel-blue accent `#3B6B94`, page `#F2F7FB`, tint `#EAF2F9`, warm alert/request cards `#FEF3E2`, ink `#1B2733`. Change colours in one place: the `@theme` block in `src/app/globals.css`. After editing it, restart `npm run dev` (the dev server can keep serving the old stylesheet).
- **Design system:** tokens are in `src/app/globals.css`, shared pieces in `src/components/ui.tsx` (Screen, Button, TabBar, Avatar, SelectField, MoodFace, text-size classes). The opportunity screen was restyled to match; its logic and wording are unchanged, and its tests pass.
- **Invite links:** `/join/<token>` tokens are signed with `INVITE_SECRET`, falling back to `SUPABASE_SERVICE_ROLE_KEY`. Rotating that key invalidates old links, and links cannot be revoked one by one.
- **Gemini free tier:** rate limits are low, so avoid hammering Save during the demo. The profile view retries a failed structuring. Google may use free-tier content to improve its products, so use fake data only.
- **Lint:** about 18 `no-explicit-any` errors remain in `tests/` files. They do not affect the build.
- **Security:** the service-role key was shared in chat during setup. Rotate it in Supabase after the hackathon.

## 6. Screens and routes

| Screen | Route | Notes |
|---|---|---|
| Phone number / set up a loved one | `/` | Redirects to the dashboard or picker when the device is known. |
| Profile picker | `/profiles` | Tiles per member, "+ Add profile", "use a different number". |
| Invite join | `/join/[token]` | Name, pronouns, relationship. |
| Questionnaire | `/questionnaire` | 6 free-text questions, Skip on each. |
| Calendar step | `/calendar` | Optional; Google Calendar greyed out. |
| Dashboard | `/dashboard` | Alerts, mood trend, requests, ideas, upcoming, recent calls, invite card, notifications button. |
| Call detail | `/calls/[id]` | Mood, summary, flags, follow-ups, transcript. |
| Idea / visit proposal | `/opportunities/[id]` | The page a push opens: quote, slots, Confirm (first accept wins). |
| Availability | `/availability` | Weekly grid. |
| Profile | `/profile` | Answers, editable tags, Switch profile. |

| API route | Purpose |
|---|---|
| `POST /api/link/lookup` | Find the elder by phone. Returns the id and first name only. |
| `POST /api/link/elders` | Create the elder from the setup profile; falls back if newer columns are missing. |
| `GET/POST /api/seniors/[id]/members` | The picker's family list; add a family profile. |
| `POST /api/link/join` | Join by phone (still available). |
| `GET /api/link/invite?member_id=`, `GET /api/invite/[token]`, `POST /api/invite/join` | Invite links. |
| `GET/PUT /api/members/[id]/profile`, `PUT .../tags` | Questionnaire answers and tags (Gemini structuring). |
| `GET/PUT /api/members/[id]/availability` | Weekly availability. |
| `POST /api/schedule/confirm` | First accept wins, via `confirm_opportunity_slot`. |
| `POST /api/push/register`, `POST /api/push/test` | Notifications (teammates). |

## 7. Not built yet

- Accept action on call requests (`POST /api/call-requests/[id]/accept`, v2 in the routes spec).
- Alert acknowledge button.
- Google Calendar connection.
- Visit detail and cancel screen.
- Birthday and elder profile shown on the dashboard, and an edit screen for the elder profile.
- Deep links that survive sign-in: opening a push link while signed out loses the link.
- "Remove me" from a family circle.
