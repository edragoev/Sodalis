# Scheduler Algorithm

## v1 (demo)
Build this first. The full algorithm below is v2.

1. Expand the elder's `preferred_windows` and each member's `manual_availability` into 30-minute slots over the next 7 days (senior's timezone; compute in UTC).
2. Candidates: slots in both sets, with enough contiguous slots for the kind (visit 2 h, call 30 min), not overlapping confirmed visits or Hope calls.
3. Constraints: max 1 contact per day, min 24 h gap from other contacts.
4. Order members by least recently contacted, then slots by earliest start. Return the first 3 slots per member.
5. Opportunity tweaks: `target_date` limits slots to that day or earlier (the day itself counts, in the senior's timezone); perishable `gift_errand` prefers the next 3 days.
6. No candidates: return nothing and show "needs a quick OK" on the dashboard.

Interface: `getSlots(member_id, kind, days) → [{id, starts_at, ends_at}]`, used by Hope's tools and the coordinator.

# v2: full algorithm

**Grid:** 30-minute slots over a 14-day horizon in the senior's timezone. Compute in UTC; convert for display.

## Inputs
- S = the elder's `preferred_windows` expanded to concrete slots.
- F_m = slots where member m is free = (available window from Google or manual grid) minus Google busy intervals.
- Confirmed visits and existing Hope calls block their slots for the senior.

## Candidates
C = {(m, s) : s ∈ S ∩ F_m and the slot run fits the kind}. A visit needs 2 h (4 contiguous slots); a call needs 30 min.

## Score (all terms 0..1)
`score = 0.35·fairness + 0.30·engagement + 0.35·urgency`

- **Fairness:** `1 − n_m / max(1, max_j n_j)`; n_m is m's contacts in the trailing 30 days including provisional picks this run.
- **Engagement:** `0.6·P_m + 0.4·T_s`. P_m is an EWMA (α=0.5) of `outcome_engagement` for contacts with m. T_s is the average engagement of check-ins in the same time-of-day bucket. Both are Laplace-smoothed toward 0.5.
- **Urgency:** `min(1, days_since_last_contact / 7) + 0.3·[pending call_request] + 0.3·[unacknowledged warn/urgent alert]`, clamped to 1. With an open `call_request`, weights become 0.2/0.2/0.6 and slots within 48 h get +0.2.

## Greedy loop
1. Score all candidates.
2. Pick the max (ties go to earliest start); commit as `proposed`.
3. Remove candidates overlapping the commit. Constraints: max 1 contact per day, max 1 visit per member per week, min 24 h gap between contacts.
4. Increment n_m and recompute fairness (this rotates the rota).
5. Repeat until target met (default 3 contacts/week, at least 1 visit per fortnight) or candidates run out.

## Scope
The scheduler only schedules **family appointments with the elder**: visits and calls (`visits`), matched to the elder's preferred times and each member's free time. It does not schedule the elder's availability around Hope.

## What triggers a visit
Visits are proposed either on the regular rota (above) or in response to something the elder said in a call. Conversation-driven proposals, including the pre-targeted mode used when the elder names a family member, are in [conversation-to-visit](../06-notifications/conversation-to-visit.md).

## Hope check-in calls (outside the scheduler)
A fixed daily time inside `hope_call_windows` (default late morning), skipping times within 2 h of a confirmed family visit/call. Retry a missed call after 30 min. No scoring. T_s is still computed from Hope check-ins and reused when scoring family slots.

## Fallback
If S ∩ F_m is empty for everyone, return the 3 nearest near-misses (window widened ±1 h) flagged "needs a quick OK".
