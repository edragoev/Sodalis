# Hope's In-Call Tools

Hope (the Vapi assistant) can call tools during the conversation. This lets her check when family are free and start a visit request while the elder is still on the phone, so a family member's phone can buzz before the call ends.

**Rule: Hope may name a day, but never confirms.** She says "Danny's free Saturday afternoon. Want me to ask them?" and never "Danny is coming Saturday."

## 1. Flow
1. The elder mentions a family member or something to do together.
2. Hope calls `get_family_availability` and offers a day: "Want me to ask them?"
3. The elder agrees, and Hope calls `propose_visit`.
4. The server creates an `opportunities` row (`source = 'hope_tool'`, `check_in_vapi_call_id` set) and starts the [coordinator agent](coordinator-agent.md) right away.
5. Hope says "I'll ask Danny" and carries on with the conversation.

## 2. Tools
All tools are Vapi function tools pointing at `POST /api/vapi/tools` (same shared-secret header as the webhook).

All three core tools are v1; `recall` is v2.

| Tool | Args | Returns | Notes |
|---|---|---|---|
| `get_family_availability` | `member` (name or relationship, optional) | Up to 3 free days/parts of day per matching member, e.g. `"Danny: Sat afternoon, Sun morning"` | v1: queries the manual grid and confirmed visits in Supabase (section 3). No member given → summary for everyone. |
| `propose_visit` | `member` (optional), `kind` (visit/call), `reason`, `quote`, `preferred_day` (optional), `type` (opportunity type) | `"ok, I'll ask Danny"` | Creates the opportunity and starts the coordinator. Idempotent per call + member + type. |
| `flag_concern` | `type` (health/safety/low_mood), `detail`, `severity` | `"ok"` | Inserts an `alerts` row immediately; urgent → high-priority push. Post-call extraction still runs as the source of truth. |
| `recall` (v2) | `query` | A short fact from past check-ins | Simple keyword/topic search over `check_ins.topics` and summaries. Skip if short on time. |

Tool results are short, speakable sentences. Hope must not read slot lists aloud.

## 3. Latency
Voice can't wait long, so the tool must answer in under 500 ms.
- **v1:** availability comes only from the manual grid, so `get_family_availability` runs the v1 scheduler directly against Supabase. That is fast enough.
- **v2 (with Google Calendar):** compute each member's free slots before dialing, store them in `hope_calls.availability_cache jsonb`, and have the tool read only that cache.

Either way the answer is a hint. The coordinator re-runs the scheduler before proposing real slots.

## 4. Webhook format
- Vapi sends `message.type = "tool-calls"` with `message.toolCallList[]` (`id`, `function.name`, `function.arguments`) and `message.call` (map the senior by `call.customer.number`).
- Respond `{ "results": [{ "toolCallId": "...", "result": "string" }] }`.
- On any error, return a graceful result ("I'll pass that along") instead of failing, so Hope never goes silent.

## 5. Prompt additions (see [hope-persona](../03-ai/hope-persona.md))
- Use `get_family_availability` only after the elder brings someone up, or says they're lonely or want company.
- Offer at most one day. Ask before proposing: "Want me to ask them?"
- Never say a visit is booked or that someone will definitely come.
- If no one is free: "I'll let the family know you'd love a visit."
- Call `flag_concern` straight away on falls, chest pain or confusion, then stay calm and keep talking.

## 6. Dedup with post-call extraction
- Opportunities from `propose_visit` carry `check_in_vapi_call_id`.
- When the `end-of-call-report` arrives, the webhook links them to the new `check_ins` row and skips any extracted opportunity with the same type and member (or item) from that call.
