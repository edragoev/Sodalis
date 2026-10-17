# Family Member Questionnaire

> **v2 (stretch).** v1 seeds each member's tags and `profile_summary` directly (section 10 has the sample answers). Matching and Hope's context use the seeded tags.

Each family member describes, in their own words, what they enjoy and what they like doing with the elder. The answers become structured tags that drive who gets notified for an opportunity (see [conversation-to-visit](../06-notifications/conversation-to-visit.md)). The family member who loves cooking gets the zucchini.

## 1. When it appears
- Right after the member [links to the elder by phone number](family-linking.md).
- Any time from the profile screen (section 4).
- Skippable. A skipped or thin profile never blocks notifications (section 6).

## 2. Questions
Open-ended free text, one per screen, 1-3 sentences expected. Stored by `question_key`.

| key | Question |
|---|---|
| `with_elder` | What do you like to do with the elder when you visit? |
| `interests` | What are your hobbies and interests? |
| `skills` | What are you good at, or happy to help with (fixing things, driving, cooking, tech)? |
| `talk_about` | What do you two talk about or laugh about? |
| `wish` | Is there something you'd love to do with them but haven't yet? |
| `logistics` | When and how are you usually able to visit? |

`logistics` is free text only. Calendar free/busy or the manual grid stays the source of truth for times.

## 3. Structuring step (Gemini Flash)
On save, send all answers to Gemini with `responseMimeType: application/json` and a `responseSchema`:

```json
{
  "interests": ["string"],
  "activities_with_elder": ["string"],
  "skills": ["string"],
  "conversation_topics": ["string"],
  "constraints": { "can_drive": "bool|null", "travel_minutes": "number|null", "notes": "string|null" },
  "summary": "string (one friendly sentence)"
}
```
- Tags are lowercase, short nouns or verbs ("cooking", "gardening", "driving").
- Only include what the member actually said. Do not infer.
- Original answers are kept. Tags are shown back as editable chips; manual edits override Gemini and are not overwritten by later re-runs unless the member changes the related answer.
- If Gemini fails, save the answers and retry on the next view. Matching falls back to the neutral score.

## 4. Profile screen
- View and edit answers and tag chips.
- Saving answers re-runs structuring. "Last updated" is shown.
- No auth: the screen is scoped to the picked member.

## 5. How answers feed matching
In conversation-to-visit section 4, `interest_or_skill` is computed from overlap between the opportunity (`interest_tags`, `mentioned_item`, `summary`) and the member's tags:

`interest_or_skill = 0.6·overlap(activities_with_elder) + 0.25·overlap(interests ∪ skills) + 0.15·overlap(conversation_topics)`

- Overlap is the best exact or semantic match, 0..1. A Gemini embedding or short similarity call covers near misses ("zucchini" and "cooking").
- `activities_with_elder` weighs most, because the member said they enjoy doing it with the elder.
- `constraints` can filter: for example, an errand that needs a car excludes members with `can_drive = false`.

## 6. Missing or thin profile
- Still eligible, with `interest_or_skill = 0.5`.
- A gentle in-app prompt asks the member to finish the questions.
- If nobody has a profile, the opportunity goes to everyone, as in conversation-to-visit.

## 7. Using profiles elsewhere
- **Notification wording:** the push can say why they were picked ("You love cooking with the elder").
- **Hope's context:** per-call `variableValues` include each member's `profile_summary` so Hope can say "Danny loves cooking, I'll let them know". Hope still does not promise a visit.

## 8. Data
See [schema](../01-database/schema.md): `member_profile_answers` plus profile columns on `family_members`.

## 9. Privacy
Answers are visible to the family only. The open read policy caveat in the schema spec applies, so use fake demo answers.

## 10. Demo seed
| Member | Sample answer to "What do you like to do with the elder?" |
|---|---|
| Danny (grandchild) | "I love cooking with them. They teach me their recipes and we always end up in the garden." |
| Maya (grandchild) | "We play cards and look at old photos." |
| Sam (adult child) | "I fix things around their house and drive them to appointments." |
| Lena (adult child) | "We take slow walks and talk about family stories." |

## 11. Worked example
Opportunity: *"My zucchini are out of control."* (`gift_errand`, tags `gardening`, `cooking`, no name mentioned).
- Danny: `activities_with_elder = [cooking, gardening]` → overlap 1.0 → `interest_or_skill ≈ 0.85`.
- Sam: `skills = [fixing, driving]` → low overlap → ≈ 0.1.
- Danny and one more member (above the 0.4 match threshold) get the push, and the first to accept claims it.
