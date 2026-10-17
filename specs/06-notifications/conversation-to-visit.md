# Conversation-to-Visit Notifications

How Hope's conversation with Grandma becomes a notification asking a family member to visit (or call). Example: Grandma talks about her garden, and her grandson is asked to come pick up zucchini.

**Rule: suggest only.** Nothing is booked until a family member confirms.

## 1. Flow
1. Call ends, and Vapi sends `end-of-call-report` to the webhook (see [routes](../02-api/routes.md)).
2. Gemini extraction returns `opportunities[]` (schema in section 3).
3. Filter by confidence, dedup, and save to `opportunities` (status `detected`).
4. Match to member(s) (section 4).
5. Generate up to 3 candidate slots using the scheduler (section 5).
6. Send FCM push (section 6); status becomes `proposed`.
7. A member taps Confirm on a slot, and a `visits` row is created (`confirmed`, `opportunity_id` set). The opportunity becomes `confirmed`.

## 2. Opportunity types
| Type | Meaning | Example utterance | Default urgency |
|---|---|---|---|
| `gift_errand` | Something Grandma has or needs that a relative can bring or fetch | "My zucchini are out of control." / "I'm out of tea." | normal (high if she is out of a necessity) |
| `activity` | Something to do together | "I haven't played cards in ages." | low |
| `event` | Time-anchored moment | "My birthday is on the 14th." / "I have a doctor's appointment Tuesday." | high as the date nears |
| `wants_contact` | She wants someone to see or call her (replaces the standalone `call_requests` trigger; the table stays, linked to the opportunity) | "I'd love to hear from Maya." | high |

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
**Grandma names someone.** Resolve by name or relationship alias ("my grandson" resolves to the single grandson; if several match, they all count). Only the named member(s) are notified, and the proposal is addressed to them.

**Grandma names no one.** Score each member:

`match = 0.5·interest_or_skill + 0.3·relationship_fit + 0.2·availability_in_horizon`

- Notify members above 0.4, up to 2. If none qualify, notify everyone.
- The family decides who takes it: the push shows suggested matches and the slots, and the first member to accept claims it.
- Needs `family_members.interests[]`, `skills[]` and `relationship`.

## 5. Slot proposal (reuses the [scheduler](../04-scheduler/algorithm.md))
- Candidates: S ∩ F_m for each notified member.
- **Pre-targeted mode** when a member was named: drop the fairness term, because she asked for that person. Reweight to `0.45·urgency + 0.35·engagement + 0.20·date_fit`.
- **Event type:** restrict slots to the window ending at `target_date` (for example 1-3 days before a birthday, or the appointment day itself for a ride).
- **`gift_errand` with perishable items (zucchini):** prefer the next 3 days.
- Return the top 3 slots with the 30-minute grid and the usual constraints (1 contact per day, 24 h gap). If there are no candidates, return the nearest 3 near-misses flagged "needs a quick OK".

## 6. Notification payload (FCM)
- **Title:** short and warm, such as "Grandma has zucchini for you".
- **Body:** the quote and the slots, such as "'My zucchini are out of control.' Thu 4pm, Fri 10am, Sat 2pm".
- **Data:** `opportunity_id`, slot ids, `urgency`.
- **Actions:** Confirm slot, Pick another, Can't make it.
- **Priority:** `high` urgency maps to FCM high priority; others are normal.
- **Privacy:** short quotes only. Health detail stays in the dashboard.

## 7. Lifecycle
`detected → proposed → confirmed | declined | expired`

- **Named member, no response:** one reminder after 24 h (4 h when urgent); then surface to the whole family as "unclaimed".
- **Unnamed:** matches first; everyone else after the same timeout.
- **Concurrency:** the first accept wins via an atomic `UPDATE opportunities SET status='confirmed' WHERE id=$1 AND status='proposed'`. Others get an "already covered by [name]" update.
- **Declined by everyone notified:** escalate to everyone; if still declined, mark `expired` and show it on the dashboard.
- **Expired:** past `target_date` or 14 days with no taker.

## 8. Dedup and rate limits
- Collapse the same type and item within 7 days (updating the existing opportunity instead of creating another).
- Max 2 pushes per member per day; bundle low-urgency ones into a daily digest.

## 9. Hope's behavior
- Never promises a visit or time. She says "I'll pass that along to [name]."
- Asks a natural follow-up to sharpen the signal (how many zucchini, which days suit her).
- Does not name a member herself if Grandma did not.

## 10. Dashboard
A realtime "Opportunities" feed showing the quote, status, who was notified and who accepted. Realtime is enabled on `opportunities` (in addition to the tables in the [schema](../01-database/schema.md)).

## 11. Worked example
Transcript: *"My zucchini are out of control this year. Danny loves them, you know."*

```json
{
  "type": "gift_errand",
  "summary": "Grandma has more zucchini than she can use and thinks of Danny.",
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
2. "Danny" resolves to the grandson, so only Danny is notified (pre-targeted mode).
3. The scheduler returns Thu 4pm, Fri 10am, Sat 2pm (perishable: within 3 days).
4. Danny gets the push. He taps Thu 4pm, a `visits` row is created (`confirmed`, `opportunity_id` set) and the opportunity becomes `confirmed`.
5. The rest of the family sees "Danny is picking up zucchini Thu 4pm" on the dashboard.

**No name mentioned:** "My zucchini are out of control." The match score favors members with gardening or cooking interests. The top two get the push with the slots, and the first to accept claims it.

## 12. Edge cases
- Named member doesn't exist: treat as unnamed and note it in the summary.
- Two members share a name: notify both.
- Grandma changes her mind later: a new opportunity or a cancellation phrase in a later call marks the earlier one `expired`.
- Call yields no opportunities: nothing is sent.
- Duplicate webhook delivery: idempotent via `check_ins.vapi_call_id`, so opportunities are created once.
