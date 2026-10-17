# Conversation-to-Visit Notifications

How Hope's conversation with the elder becomes a notification asking a family member to visit (or call). Example: the elder talks about their garden, and a grandchild is asked to come pick up zucchini.

**Rule: suggest only.** Nothing is booked until a family member confirms.

> Choosing who to notify and writing the push are now done by the [coordinator agent](../08-agents/coordinator-agent.md), using sections 4 and 6 as its shortlist and fallback. Opportunities can also start mid-call via [Hope's tools](../08-agents/hope-tools.md).

## 1. Flow
A push starts from one of two triggers. Both end in the same step: the [coordinator agent](../08-agents/coordinator-agent.md) picks the member(s) and slots, writes the push, and the push opens the web app (section 6).

- **During the call (elder names a person):** Hope detects the named member, checks availability and, once the elder agrees, calls `propose_visit` ([hope-tools](../08-agents/hope-tools.md)). The server creates the opportunity (`source = 'hope_tool'`) and starts the coordinator right away, so the member's phone can buzz before the call ends. The post-call extraction later skips the same type and member from that call, so there is no second push.
- **After the call (no one named):** the steps below run on the transcript. Gemini finds the opportunities, and the coordinator decides who to ask using the member match in section 4, then creates the push.

The post-call steps cover unnamed opportunities only. If the extraction finds an opportunity that names a member and Hope did not already propose it live, it is saved and shown on the dashboard but not pushed.

**Post-call steps**
1. Call ends, and Vapi sends `end-of-call-report` to the webhook (see [routes](../02-api/routes.md)).
2. Gemini extraction (an AI scan of the transcript) returns `opportunities[]` (schema in section 3).
3. Filter by confidence, dedup, and save to `opportunities` (status `detected`).
4. Match to member(s) (section 4).
5. Generate up to 3 candidate slots using the scheduler (section 5).
6. Send FCM push to the related family members (section 6); status becomes `proposed`. The push opens the web application at `/opportunities/[id]`.
7. A member taps the push and lands in the web app, then taps Confirm on a slot. A `visits` row is created (`confirmed`, `opportunity_id` set) and the opportunity becomes `confirmed`.

## 2. Opportunity types
| Type | Meaning | Example utterance | Default urgency |
|---|---|---|---|
| `gift_errand` | Something the elder has or needs that a relative can bring or fetch | "My zucchini are out of control." / "I'm out of tea." | normal (high if the elder is out of a necessity) |
| `activity` | Something to do together | "I haven't played cards in ages." | low |
| `event` | Time-anchored moment | "My birthday is on the 14th." / "I have a doctor's appointment Tuesday." | high as the date nears |
| `wants_contact` | The elder wants someone to see or call them (replaces the standalone `call_requests` trigger; the table stays, linked to the opportunity) | "I'd love to hear from Maya." | high |

## 3. Extraction schema
Added to the Gemini output (see [hope-persona](../03-ai/hope-persona.md)):

```json
"opportunities": [{
  "type": "gift_errand|activity|event|wants_contact",
  "summary": "string",
  "quote": "string (short, verbatim)",
  "mentioned_member": "string|null",
  "mentioned_item": "string|null",
  "interest_tags": ["string"],
  "target_date": "ISO date|null",
  "urgency": "low|normal|high",
  "confidence": "number 0..1",
  "suggested_kind": "visit|call"
}]
```
- Confidence below 0.6 is saved but not pushed (visible in the dashboard only).
- Distress, health and safety mentions are not opportunities; they go through `alerts`.

## 4. Choosing who to notify
**The elder names someone.** Resolve by name or relationship alias ("my grandchild" resolves to the single grandchild; if several match, they all count). Only the named member(s) are notified, and the proposal is addressed to them.

**The elder names no one.** Score each member:

`match = 0.5·interest_or_skill + 0.3·relationship_fit + 0.2·availability_in_horizon`

- Notify members above 0.4, up to 2. If none qualify, notify everyone.
- The family decides who takes it: the push shows suggested matches and the slots, and the first member to accept claims it.
- `interest_or_skill` comes from the member's questionnaire answers, structured into tags (`activities_with_elder`, `interests`, `skills`, `conversation_topics`). Details and weights are in [member-questionnaire](../07-onboarding/member-questionnaire.md).
- A member with no profile gets a neutral 0.5 and is still eligible. If nobody has a profile, notify everyone.
- The push can say why the member was picked ("You love cooking with the elder").

## 5. Slot proposal (reuses the [scheduler](../04-scheduler/algorithm.md))
- Candidates: S ∩ F_m for each notified member.
- **Pre-targeted mode** when a member was named: drop the fairness term, because the elder asked for that person. Reweight to `0.45·urgency + 0.35·engagement + 0.20·date_fit`.
- **Event type:** restrict slots to the window ending at `target_date` (for example 1-3 days before a birthday, or the appointment day itself for a ride).
- **`gift_errand` with perishable items (zucchini):** prefer the next 3 days.
- Return the top 3 slots with the 30-minute grid and the usual constraints (1 contact per day, 24 h gap). If there are no candidates, return the nearest 3 near-misses flagged "needs a quick OK".

## 6. Notification payload (FCM)
v1: the coordinator writes the title and body (template as fallback). The push goes only to the related family members chosen in section 4, and it always directs them into the web application: tapping it opens `/opportunities/[id]`, which shows the quote, the slots and a Confirm button per slot. Confirming happens in the web app, not in the notification. The notification has no action buttons.

- **Recipients:** only the family members resolved in section 4 (named member(s), or the top matches). Members who are not notified do not get the first push and see the opportunity only on the dashboard, until the v2 reminder or escalation in section 7 widens it to everyone.
- **Destination:** the push carries a link to `/opportunities/[id]` (FCM `webpush.fcm_options.link`, with the same URL in `data` for the service worker's click handler). A tap or click on a web push focuses an open tab of the app, or opens a new one, and navigates to that route.
- **Signed-out recipient:** the app asks them to sign in, then returns them to `/opportunities/[id]`.
- **Already claimed:** if another member accepted first, the page shows "already covered by [name]" instead of the Confirm buttons.

- **Title:** short and warm, such as "A visit idea: zucchini from the garden".
- **Body:** the quote and the slots, such as "'My zucchini are out of control.' Thu 4pm, Fri 10am, Sat 2pm".
- **Data:** `opportunity_id`, slot ids, `urgency`, and the `/opportunities/[id]` link.
- **Actions (v2):** Confirm slot, Pick another, Can't make it.
- **Priority:** `high` urgency maps to FCM high priority; others are normal.
- **Privacy:** short quotes only. Nothing about the elder's health goes in a push: if the quote is about feeling unwell or pain ("my knee hurts"), the push leaves it out and uses the summary instead. Health detail stays in the dashboard.

## 7. Lifecycle
`detected → proposed → confirmed | declined | expired`

v1: first accept wins (concurrency rule below) and others see "already covered by [name]". Reminders, escalation and expiry are v2.

- **Named member, no response:** one reminder after 24 h (4 h when urgent); then surface to the whole family as "unclaimed".
- **Unnamed:** matches first; everyone else after the same timeout.
- **Concurrency:** the first accept wins via an atomic `UPDATE opportunities SET status='confirmed' WHERE id=$1 AND status='proposed'`. Others get an "already covered by [name]" update.
- **Declined by everyone notified:** escalate to everyone; if still declined, mark `expired` and show it on the dashboard.
- **Expired:** past `target_date` or 14 days with no taker.

## 8. Dedup and rate limits
v1: dedup only. Rate limits and the digest are v2.

- Collapse the same type and item within 7 days (updating the existing opportunity instead of creating another).
- Max 2 pushes per member per day; bundle low-urgency ones into a daily digest.

## 9. Hope's behavior
- Never confirms a visit. Hope may offer a free day from `get_family_availability` and ask "Want me to ask them?" (see [hope-tools](../08-agents/hope-tools.md)).
- Asks a natural follow-up to sharpen the signal (how many zucchini, which days suit the elder).
- Does not name a member unprompted if the elder did not.

## 10. Dashboard
A realtime "Opportunities" feed showing the quote, status, who was notified and who accepted. Realtime is enabled on `opportunities` (in addition to the tables in the [schema](../01-database/schema.md)).

## 11. Worked example
Transcript (Danny is named, so this runs live through `propose_visit` during the call): *"My zucchini are out of control this year. Danny loves them, you know."*

```json
{
  "type": "gift_errand",
  "summary": "The elder has more zucchini than they can use and thinks of Danny.",
  "quote": "My zucchini are out of control this year.",
  "mentioned_member": "Danny",
  "mentioned_item": "zucchini",
  "interest_tags": ["gardening", "cooking"],
  "target_date": null,
  "urgency": "normal",
  "confidence": 0.86,
  "suggested_kind": "visit"
}
```
1. Confidence 0.86 passes the threshold; saved as `detected`.
2. "Danny" resolves to the grandchild, so only Danny is notified (pre-targeted mode).
3. The scheduler returns Thu 4pm, Fri 10am, Sat 2pm (perishable: within 3 days).
4. Danny gets the push and taps Thu 4pm; a `visits` row is created (`confirmed`, `opportunity_id` set) and the opportunity becomes `confirmed`.
5. The rest of the family sees "Danny is picking up zucchini Thu 4pm" on the dashboard.

**No name mentioned:** "My zucchini are out of control." The match score favors members with gardening or cooking interests. The top two get the push with the slots, and the first to accept claims it.

## 12. Edge cases
- Named member doesn't exist: treat as unnamed and note it in the summary.
- Two members share a name: notify both.
- The elder changes their mind later: a new opportunity or a cancellation phrase in a later call marks the earlier one `expired`.
- Call yields no opportunities: nothing is sent.
- Duplicate webhook delivery: idempotent via `check_ins.vapi_call_id`, so opportunities are created once.
