# Product Decisions, Scope, Build Order, Risks

## Decisions
- Senior and family surfaces matter equally.
- Hope reaches the elder by outbound Vapi phone calls; the elder has no app.
- Scheduler schedules family appointments with the elder (visits/calls in `visits`) against the elder's preferred times. Hope check-in calls run on a fixed cadence outside the scheduler.
- Family free time from a manual weekly grid (v1). Google Calendar free/busy is v2.
- Alerts: low mood, health/safety, missed check-in, wants family contact.
- `call_requests`: the elder asks Hope to get a relative to call.
- Scale: 1 senior, 3-4 family members.
- No auth. v1: the elder and 4 family members are seeded, and a "Who are you?" picker saves `member_id` to localStorage (drives FCM tokens and fairness). v2: members link by the elder's phone number. See [family-linking](../07-onboarding/family-linking.md).
- Demo priority: reliable call-to-dashboard loop, then the live mid-call buzz.
- Hope has in-call tools: she may offer a free day ("want me to ask?") but never confirms. Pushes can go out live during the call. See [hope-tools](../08-agents/hope-tools.md).
- Coordinator: v1 is one Gemini call that picks from a code-built shortlist, chooses slots and writes the push, validated in code with a template fallback. v2 is a tool-calling agent loop. See [coordinator-agent](../08-agents/coordinator-agent.md).
- Push notifications via Firebase Cloud Messaging (FCM) web push. No SMS.
- Team: 4 beginners. Scope is v1; v2 is stretch.
- No accounts exist yet: Vapi + number, Gemini, Supabase, Firebase (Google Cloud OAuth only for v2).

## Scope: v1 vs v2
| Area | v1 (build this) | v2 (stretch) |
|---|---|---|
| Hope's call | Vapi assistant, persona prompt, outbound call via "Call now" button | Daily cron calls with retries and missed-check-in alerts |
| Hope's in-call tools | `get_family_availability`, `propose_visit`, `flag_concern`, querying Supabase directly | `recall`, pre-dial availability cache |
| After the call | Webhook → Gemini extraction → `check_ins`, `alerts`, `opportunities`; idempotency; dedup with Hope-created opportunities | — |
| Choosing who to notify | Code shortlist → one Gemini call → code validation → template fallback | Coordinator agent loop with tools |
| "Why Danny?" trace | Input/output of the Gemini call in `agent_runs`; `why` shown on the dashboard | Full step-by-step tool trace |
| Scheduler | [v1 simple version](../04-scheduler/algorithm.md#v1-demo) | Full scoring and greedy loop |
| Family availability | Manual weekly grid | Google Calendar free/busy |
| Push (FCM) | Web push on Chrome desktop/Android; tap opens `/opportunities/[id]`; test-push button | Notification action buttons, iOS install, reminders, escalation, expiry, digest, rate limits |
| Confirming | First accept wins; others see "already covered by [name]" | — |
| Family members | Seeded 4 members with tags + "Who are you?" picker | Phone-number linking |
| Member profiles | Seeded tags | Questionnaire + Gemini structuring + profile editing |
| Dashboard | Live feed of check-ins, alerts and opportunities | Trends over time, polished UI |

## Build order (12 h, 4 people in 2 pairs)
Work in tiers. Each tier is a working demo; don't start the next until the current one works end to end.

| Hours | Pair 1: Voice + backend | Pair 2: Frontend + AI |
|---|---|---|
| 0-1.5 | Vapi account, number, assistant + persona prompt, test call to own phone. `create-next-app`, Vercel deploy, env vars | Supabase schema + seed (elder + 4 members with tags + availability grids), realtime. Firebase project |
| 1.5-3 | Webhook stub on Vercel; save a real `end-of-call-report` as a fixture; replay script | FCM hello world: "Send test push" button reaches your own browser. Dashboard shell + "Who are you?" picker |
| 3-7 | **Tier 1:** webhook pipeline (idempotency, Gemini extraction, `check_ins` / `alerts` / `opportunities` inserts) | **Tier 1:** live dashboard feed (check-ins, mood, summary, alerts, opportunities). v1 scheduler |
| 7-10 | **Tier 2:** `/api/vapi/tools` (`get_family_availability`, `propose_visit`, `flag_concern`); one tool working in a real call first; prompt tuning | **Tier 2:** template push on new opportunity; `/opportunities/[id]` page with Confirm (first accept wins). **Tier 3:** single-call coordinator + "Why Danny?" |
| 10-12 | **Feature freeze at 10.** Everyone: full demo run-throughs, fix bugs, seed polish, README, fallback video | |

Interfaces to agree in hour 0: table columns (schema spec), `getSlots(member_id, kind, days) → slots[]`, `sendPush(member_ids, title, body, data)`.

**Checkpoints:** hour 3, a test push arrives and a replayed fixture hits the webhook; hour 7, a real call shows up on the dashboard (Tier 1); hour 10, a member's phone buzzes while the elder is still on the call (Tier 2).

**v2 stretch (only after the hour-10 checkpoint):** coordinator agent loop, full scheduler, Google Calendar, phone linking, questionnaire, Hope-call cron, reminders/escalation, notification action buttons, `recall` tool, digest.

## Risks
1. Hope's tool timing on a real call (awkward pauses, tools fired at the wrong moment). Get one tool working live early.
2. FCM setup: permission must be requested from a click; VAPID key needed; service-account private key `\n`s break in env vars; push needs HTTPS or localhost; old service workers stay cached. The live dashboard is the backup.
3. Vapi outbound needs a number; dial only your own or teammates' phones.
4. iOS web push needs Add to Home Screen (iOS 16.4+); demo on Android/desktop Chrome.
5. Open read policy: seed fake data only.
6. Gemini model id comes from env.
7. Google OAuth (v2): unverified app has a 100 test-user cap and a warning screen.

## Verification
- Replay a canned `end-of-call-report` at the webhook; check row, alerts, realtime update.
- Webhook idempotency: same call twice gives one row.
- Real Vapi call to a test phone; confirm dashboard update and FCM push.
- Mid-call: `propose_visit` sends a push before the call ends; post-call extraction doesn't duplicate it.
- Coordinator: invalid Gemini output (unknown member, bad slot, health text) falls back to the template.
- Scheduler: intersection and constraints (1 contact/day, 24 h gap).
