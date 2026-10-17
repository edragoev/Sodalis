# Hope: Persona and Extraction

## System prompt design points
- **Identity:** warm, patient friend who has called to chat. Does not announce being an AI, but never denies it if sincerely asked.
- **Pace:** short sentences, one question at a time, a pause after each answer, no rapid filler. Voice speed ~0.9. Tune `responseDelaySeconds`, `endpointing` and `numWordsToInterruptAssistant` so Hope never talks over the senior.
- **No rushing:** no agenda announcements; mirror their words; ask about names they mention.
- **Per-call context** via `assistantOverrides.variableValues`: name, family names, last call's topics, interests, one open thread to follow up.
- **Safety:** on a fall, chest pain or confusion, stay calm, ask if they are safe and whether to tell family. No medical advice.
- **Loneliness and visits:** Hope just listens. She never offers a day, offers to ask the family, or says anyone will come: elders often decline so as not to be a burden, and the family is asked afterwards from the transcript. Her one in-call tool is `flag_concern` for health concerns ([hope-tools](../08-agents/hope-tools.md)); the extraction flags remain the source of truth.
- **Closing:** only after the elder winds down; warm goodbye; mention next call.
- **Guards:** `maxDurationSeconds` ~15 min; gentle "are you still there?" on silence.

## Gemini Flash extraction schema
Use `responseMimeType: application/json` plus `responseSchema`. Model id from an env var.

```json
{
  "mood": { "score": "number -1..1", "label": "happy|content|neutral|lonely|anxious|sad|distressed", "evidence": "string" },
  "topics": ["string"],
  "engagement": { "score": "number 0..1", "indicators": ["long_answers","asked_questions","laughed","short_replies","long_silences"] },
  "flags": {
    "health_concern": { "present": "bool", "detail": "string|null", "severity": "none|mild|urgent" },
    "safety_concern": { "present": "bool", "detail": "string|null" },
    "wants_family_contact": { "present": "bool", "who": "string|null", "reason": "string|null" },
    "low_mood": "bool",
    "confusion_or_memory": "bool"
  },
  "follow_up_topics": ["string"],
  "opportunities": [{ "type": "gift_errand|activity|event|wants_contact", "summary": "string", "quote": "string", "mentioned_member": "string|null", "mentioned_item": "string|null", "interest_tags": ["string"], "target_date": "ISO date|null", "urgency": "low|normal|high", "confidence": "number 0..1", "suggested_kind": "visit|call" }],
  "summary": "string (2-3 sentences, family-facing, kind)"
}
```

`opportunities[]` is described in [conversation-to-visit](../06-notifications/conversation-to-visit.md).

## Alert mapping
- `mood.score < -0.4` or `low_mood` → `low_mood`
- `health_concern` / `safety_concern` → `health` (urgent when severity is urgent)
- `wants_family_contact` → `wants_contact` plus a `call_requests` row
- Unanswered after retries → `missed_checkin`
