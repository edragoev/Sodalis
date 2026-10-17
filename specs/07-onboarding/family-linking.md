# Linking Family to the Elder by Phone Number

> **v2 (stretch).** v1 seeds the elder and 4 family members, and a "Who are you?" picker saves `member_id` and `senior_id` to localStorage, then asks for push permission. Build this flow only after the v1 demo works.

How a family member connects to an elder with no accounts or passwords. The elder's phone number is the link. It is the same number Hope calls, and the Vapi webhook already uses it to map calls to the senior (`call.customer.number`).

This replaces the earlier "Who are you?" picker. Members are no longer pre-seeded. The demo seeds only the elder.

## 1. Flow
1. Welcome screen asks "What's your loved one's phone number?"
2. Normalize to E.164 (default region from config, `+1`) and look up `seniors.phone_e164`.
3. **Found:** show the elder's first name for confirmation ("Linking to Margaret").
4. **Not found:** "We couldn't find that number." The demo offers "Set up a new elder" (name, number, timezone), which creates the `seniors` row.
5. Ask for the member's name, relationship (free text or a short list) and optionally their own phone number.
6. Create the `family_members` row and save `member_id` and `senior_id` to localStorage.
7. Continue to the [questionnaire](member-questionnaire.md), then the push-permission prompt. The FCM token is registered with `POST /api/push/register`.

Several members can link to one elder.

## 2. Verification
None, for the demo. Typing the elder's number links immediately, and the number is only a lookup key. See section 5 for what that means and what production would add.

## 3. Routes
| Route | Purpose |
|---|---|
| `POST /api/link/lookup` | `{ phone }` → `{ found, senior_first_name }`. Returns only the first name. |
| `POST /api/link/join` | `{ phone, name, relationship, member_phone? }` → creates or reconnects the member; returns `member_id` and `senior_id`. |
| `POST /api/link/elders` | Demo-only: creates a new elder (`name`, `phone`, `timezone`). |

## 4. Return visits and duplicates
- The app keeps `member_id` and `senior_id` in localStorage.
- If localStorage is cleared, the member enters the elder's number and their name again. A case-insensitive name match against that elder's members asks "Is this you?" and reconnects instead of creating a duplicate.
- A unique constraint on `(senior_id, lower(name))` stops two simultaneous joins creating duplicates.

## 5. Security caveats (demo)
- Anyone who knows the number can join and read the family dashboard, which includes call summaries and mood.
- Rate-limit lookup (for example 10 per minute per IP) so numbers can't be enumerated.
- Lookup returns only the first name.
- Production hardening: a one-time code sent to the elder's phone (SMS, or Hope reading it on a call) or an invite from an existing member, plus real authentication.

## 6. Edge cases
- Invalid or non-mobile number: show a clear error and do not look it up.
- Number typed with spaces, dashes or brackets: normalize before lookup.
- Leaving the family: a "Remove me" action deletes the member's row and clears their FCM token.
- The elder's number changes: update `seniors.phone_e164`; existing members stay linked by `senior_id`.

## 7. Interaction with other specs
- The Vapi webhook maps calls by the same phone number ([routes](../02-api/routes.md)).
- The questionnaire runs after linking.
- Push registration follows linking.
- The scheduler and the matching read `family_members` as before.
