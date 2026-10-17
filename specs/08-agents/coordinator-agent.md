# Coordinator

Turns an opportunity into a family notification: who to ask, which slots to offer, and what the push says. It replaces the fixed member choice and message template in [conversation-to-visit](../06-notifications/conversation-to-visit.md) sections 4 and 6, which remain as the fallback. Scheduler math, the suggest-only rule and first-accept-wins are unchanged.

**Hybrid shortlist:** code picks the candidates and slots; Gemini chooses among them and writes the message.

## Triggers
- `propose_visit` from [Hope's in-call tools](hope-tools.md), immediately (live, during the call).
- Post-call extraction, for unnamed opportunities only (named ones are handled live by `propose_visit`).

Runs in `after()` or a separate `POST /api/agent/coordinate` call, so the webhook and tool routes return fast.

## Shortlist (code, before Gemini)
- **Named member:** that member (or several if the name or alias is ambiguous).
- **No name:** the `match` score from conversation-to-visit section 4; the top 3 members above 0.4, or everyone if none qualify or nobody has tags.
- Members failing hard constraints (for example `can_drive = false` on a pickup errand) are dropped.
- For each shortlisted member, the [scheduler](../04-scheduler/algorithm.md) returns up to 3 slots.

## v1: one Gemini call
Send the opportunity (type, quote, summary, tags, urgency), the elder's first name, and for each shortlisted member: `member_id`, name, relationship, tags, `profile_summary`, last contact date, and their slots with ids. Use `responseMimeType: application/json` and a `responseSchema`:

```json
{
  "member_id": "uuid (must be on the shortlist)",
  "slot_ids": ["slot id (1-3, from that member's slots)"],
  "title": "string (short, warm)",
  "body": "string (includes the quote and the slot times)",
  "why": "string (one sentence, shown on the dashboard)"
}
```

Prompt essentials:
- Prefer named members; otherwise the strongest interest match, but spread contact fairly (last contact date).
- Warm, short, personal ("you're the cook in the family"). Never mention health.
- Never promise the elder anything; Hope already said "I'll ask."

Model id from env (`GEMINI_MODEL`).

## Validation (code, after Gemini)
Reject the output and use the **template fallback** (formula's top member, their first 3 slots, the template push) if:
- `member_id` is not on the shortlist, or any `slot_id` isn't one of that member's slots;
- the text mentions health (source check-in has health/safety flags, or a keyword list matches);
- the call errors, times out (5 s) or returns invalid JSON.

Then send one push with `data: { opportunity_id }` and set the opportunity to `proposed`.

## "Why Danny?" trace
Write one `agent_runs` row per run: input, Gemini output, whether the fallback was used and why. The dashboard shows `why` on the opportunity card.

## Worked example
*"I haven't seen Danny in ages."* During the call Hope checks availability, offers Saturday, the elder agrees, and `propose_visit(Danny, visit, "misses them", preferred_day=Sat)` runs.
1. Shortlist: Danny (named); slots Sat 2pm, Sat 4pm, Sun 11am.
2. Gemini returns Danny, Sat 2pm + Sat 4pm, "Grandma would love to see you", "'I haven't seen Danny in ages.' Sat 2pm or 4pm?", why "Grandma asked for Danny by name."
3. Validation passes; Danny's phone buzzes while the call is still going.

## v2 (stretch): agent loop
A Gemini tool-calling loop instead of the single call. Same shortlist, validation and fallback.

| Tool | Purpose |
|---|---|
| `get_opportunity()` | The opportunity, its quote, and the elder's name and preferences |
| `get_member_profile(member_id)` | Tags, `profile_summary`, constraints, contacts in the last 30 days |
| `get_recent_activity()` | Visits in the last 14 days and open opportunities (avoid piling on one person) |
| `run_scheduler(member_id, kind, window?)` | Top slots from the scheduler with the usual constraints |
| `send_push(member_ids, title, body, slot_ids)` | Sends the push; enforces the shortlist, slot, privacy and rate-limit checks; at most one per run |
| `finish(reason)` | Ends the run, e.g. "already covered", "no slots" |

- Max 8 steps; on the limit or any error, use the template fallback.
- Every step (tool, args, result, model text) is written to `agent_runs`; the dashboard shows the full trace.
- **Escalation:** timers stay in code (24 h, or 4 h when urgent). When one fires, a cron re-runs the agent with the history ("Danny didn't reply"); it may nudge once, widen to the rest of the shortlist, or `finish`.
