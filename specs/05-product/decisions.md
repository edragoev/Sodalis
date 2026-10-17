# Product Decisions, Scope, Build Order, Risks

## Decisions
- Senior and family surfaces matter equally.
- Hope reaches Grandma by outbound Vapi phone calls; she has no app.
- Scheduler schedules family appointments with the elder (visits/calls in `visits`) against Grandma's preferred times. Hope check-in calls run on a fixed cadence outside the scheduler.
- Family free time from Google Calendar free/busy, with a manual grid fallback.
- Alerts: low mood, health/safety, missed check-in, wants family contact.
- `call_requests`: Grandma asks Hope to get a relative to call.
- Scale: 1 senior, 3-4 family members.
- No auth. A "Who are you?" picker saved in localStorage drives FCM tokens and fairness.
- Engagement scoring uses per-person and per-time-slot history.
- Demo priority: reliable call-to-dashboard loop and a sophisticated scheduler.
- No accounts exist yet: Vapi + number, Gemini, Supabase, Firebase, Google Cloud OAuth.

## Build order (12 h)
| Hours | Work |
|---|---|
| 0-1.5 | Account setup, `create-next-app`, Vercel deploy, env vars |
| 1.5-3 | Schema + seed data, realtime |
| 3-5.5 | Hope assistant, webhook, Gemini extraction, alerts/call_requests; end-to-end call-to-row test |
| 5.5-8 | Dashboard, picker screen, PWA manifest + service worker, FCM |
| 8-10.5 | Scheduler plan, Google free/busy, confirm flow, Hope-call cron |
| 10.5-12 | Demo script, seed polish, README, fallback video |

## Risks
1. Google OAuth unverified app: 100 test-user cap and a warning screen. Keep the manual grid working.
2. Vapi outbound needs a number; dial only your own or teammates' phones.
3. iOS PWA push needs Add to Home Screen (iOS 16.4+); demo on Android/desktop Chrome.
4. Open read policy: seed fake data only.
5. Gemini model id comes from env.
6. The original full spec was not pasted; send any missing details (brand, extra screens, judging criteria).

## Verification
- Replay a canned `end-of-call-report` at the webhook; check row, alerts, realtime update.
- Real Vapi call to a test phone; confirm dashboard and FCM push.
- Scheduler unit tests: intersection, greedy rotation, constraints.
- Webhook idempotency: same call twice gives one row.
- Lighthouse PWA check and phone install.
