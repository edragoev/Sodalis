# Hope's In-Call Tool

Hope (the Vapi assistant) has one tool during the conversation: `flag_concern`, for a health concern. It is the only thing that reaches the family while the elder is still on the phone.

**Rule: Hope never contacts the family about a visit during the call.** An elder will often say no to "want me to ask them?" because they don't want to be a burden, so Hope doesn't ask. Visit and call ideas come from the transcript after the call ends (see [conversation-to-visit](../06-notifications/conversation-to-visit.md)). She never offers a day, checks anyone's availability, or says someone will be asked.

## 1. Flow
1. The elder mentions an urgent health or safety concern: a fall where they're hurt, chest pain, trouble breathing, sudden confusion, feeling unsafe, thoughts of self-harm.
2. Hope stays calm, keeps talking and calls `flag_concern`. Mild or past concerns don't use the tool; the post-call extraction handles them.
3. The server inserts an urgent `alerts` row at once (with `vapi_call_id`, since the check-in doesn't exist yet), answers `"ok"`, then sends a high-priority push to every family member with a push token. One push per call: later flags in the same call are saved but not pushed again.
4. The push reads `"<detail>." Soladis suggested calling 911. Tap to call <name>.` Tapping it opens the phone app to call the elder (`tel:`), or the dashboard when the browser can't dial.
5. Hope carries on; she gives no medical advice (see [hope-persona](../03-ai/hope-persona.md)).
6. When the call ends, the webhook sets `check_in_id` on the call's alerts.

## 2. Tool
A Vapi function tool pointing at `POST /api/vapi/tools` (same shared-secret header as the webhook).

| Tool | Args | Returns | Notes |
|---|---|---|---|
| `flag_concern` | `type` (`health` or `safety`), `detail` | `"ok"` | Inserts an urgent `alerts` row immediately and pushes to the family. Every call is urgent, so there is no severity argument (one sent anyway is ignored); a missing or unknown type is saved as health. Post-call extraction still runs as the source of truth, and the alerts it produces are not duplicated. |

Low mood, loneliness and every other signal wait for the post-call extraction. The result is a short, speakable word; Hope must not read anything back.

## 3. Webhook format
- Vapi sends `message.type = "tool-calls"` with `message.toolCallList[]` (`id`, `function.name`, `function.arguments`) and `message.call` (map the senior by `call.customer.number`; a web call from the dashboard's Talk button uses `DEMO_SENIOR_PHONE`, as the webhook does).
- Respond `{ "results": [{ "toolCallId": "...", "result": "string" }] }`.
- On any error, return a graceful result ("ok") instead of failing, so Hope never goes silent. The post-call extraction still catches the concern.

## 4. Prompt additions (see [hope-persona](../03-ai/hope-persona.md))
- Call `flag_concern` straight away on falls, chest pain, confusion or feeling unwell, then stay calm and keep talking.
- Never offer to ask the family for a visit, never name a day, and never say a visit is booked or that someone will come.

## 5. Dedup with post-call extraction
When the `end-of-call-report` arrives, the webhook skips any extracted health alert that matches one `flag_concern` already raised during that call (same senior, type and `vapi_call_id`).
