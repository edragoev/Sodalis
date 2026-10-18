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

## Wellbeing alerts
A second Gemini call per phone call (`src/lib/wellbeing/`, `GEMINI_MODEL`, 20 s, one attempt) turns concerns in the transcript into `alerts`. The Elder Wellbeing Alert Agent prompt (`prompt.ts`) is the system instruction; the transcript is fenced as untrusted data. Output, validated in code (`validate.ts`):

```json
{ "alerts": [{
  "category": "loneliness|emotional_wellbeing|physical_incident|daily_living|family_support|other",
  "summary": "string", "quote": "string (verbatim)", "support_needed": "string|unknown",
  "suggested_followup": "string (elder's own ask, or Unknown)", "safety": "routine|needs_review|urgent", "confidence": "number 0..1"
}] }
```
- `suggested_followup` repeats or closely paraphrases what the elder explicitly asked for ("I wish someone would come over" → "The elder wishes someone would come over."), else `Unknown` (a missing or blank value is normalised to `Unknown`). No clinical advice or assessments, no invented family tasks, no chosen family member.
- The quote must appear in the transcript, else the alert is dropped. Duplicate quotes merge, keeping the higher safety level; at most 5 alerts, most serious first.
- **Safety floor:** an alert whose quote or summary matches a serious-risk word list (a fall, chest pain, self-harm, abuse...) is never `routine`; it becomes `needs_review`. A malformed alert with a verified serious quote is kept, not dropped.
- `safety` is a routing signal, not a diagnosis: routine→`info`, needs_review→`warn`, urgent→`urgent`. `needs_review` and `urgent` send one push to the family (no health or feeling detail in it; it opens `/calls/[id]`).
- Legacy `alerts.type`: loneliness/emotional_wellbeing→`low_mood`, physical_incident→`health`, family_support→`wants_contact`, daily_living/other→`wellbeing`.

## Alert mapping
- `mood.score < -0.4` or `low_mood` → `low_mood`
- `health_concern` / `safety_concern` → `health` (urgent when severity is urgent)
- `wants_family_contact` → `wants_contact` alert plus a `wants_contact` opportunity
- Unanswered after retries → `missed_checkin`
