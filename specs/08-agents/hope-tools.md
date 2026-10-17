# Hope's In-Call Tool

Hope (the Vapi assistant) has one tool during the conversation: `flag_concern`, for a health concern. It is the only thing that reaches the family while the elder is still on the phone.

**Rule: Hope never contacts the family about a visit during the call.** An elder will often say no to "want me to ask them?" because they don't want to be a burden, so Hope doesn't ask. Visit and call ideas come from the transcript after the call ends (see [conversation-to-visit](../06-notifications/conversation-to-visit.md)). She never offers a day, checks anyone's availability, or says someone will be asked.

## 1. Flow
1. The elder mentions a fall, chest pain, confusion or feeling unwell.
2. Hope stays calm, keeps talking and calls `flag_concern`.
3. The server inserts an `alerts` row at once. An urgent one also sends a high-priority push to the family.
4. Hope carries on; she gives no medical advice (see [hope-persona](../03-ai/hope-persona.md)).

## 2. Tool
A Vapi function tool pointing at `POST /api/vapi/tools` (same shared-secret header as the webhook).

| Tool | Args | Returns | Notes |
|---|---|---|---|
| `flag_concern` | `type` (`health`), `detail`, `severity` | `"ok"` | Inserts an `alerts` row immediately; urgent → high-priority push. Falls, chest pain, confusion and feeling unwell all count as health. Post-call extraction still runs as the source of truth, and the alerts it produces are not duplicated. |

Low mood, loneliness and every other signal wait for the post-call extraction. The result is a short, speakable word; Hope must not read anything back.

## 3. Webhook format
- Vapi sends `message.type = "tool-calls"` with `message.toolCallList[]` (`id`, `function.name`, `function.arguments`) and `message.call` (map the senior by `call.customer.number`).
- Respond `{ "results": [{ "toolCallId": "...", "result": "string" }] }`.
- On any error, return a graceful result ("ok") instead of failing, so Hope never goes silent. The post-call extraction still catches the concern.

## 4. Prompt additions (see [hope-persona](../03-ai/hope-persona.md))
- Call `flag_concern` straight away on falls, chest pain, confusion or feeling unwell, then stay calm and keep talking.
- Never offer to ask the family for a visit, never name a day, and never say a visit is booked or that someone will come.

## 5. Dedup with post-call extraction
When the `end-of-call-report` arrives, the webhook skips any extracted health alert that matches one `flag_concern` already raised during that call (same senior, type and call).
