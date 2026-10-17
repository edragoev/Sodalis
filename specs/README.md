# CareChain: Family Connection AI Specs

Next.js PWA (Vercel) + Supabase + Vapi + Gemini Flash + Firebase Cloud Messaging.
"Hope" phones an isolated senior, Gemini extracts mood/topics/engagement/flags, the family dashboard updates live, and a scheduler proposes family visits/calls and Hope's own check-in calls.

| Folder | Contents |
|---|---|
| [01-database](01-database/schema.md) | Tables, indexes, realtime, security |
| [02-api](02-api/routes.md) | Route map and Vapi webhook flow |
| [03-ai](03-ai/hope-persona.md) | Hope persona, Gemini extraction schema |
| [04-scheduler](04-scheduler/algorithm.md) | Slot matching and greedy scoring |
| [05-product](05-product/decisions.md) | Decisions, scope, build order, risks |
| [06-notifications](06-notifications/conversation-to-visit.md) | How conversations become visit notifications |
| [07-onboarding](07-onboarding/member-questionnaire.md) | Family member interest questionnaire and matching profile |

Source of truth: the approved plan from the planning session. Update these files if decisions change.
