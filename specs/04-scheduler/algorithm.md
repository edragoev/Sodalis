# Scheduler Algorithm

**Grid:** 30-minute slots over a 14-day horizon in the senior's timezone. Compute in UTC; convert for display.

## Inputs
- S = Grandma's `preferred_windows` expanded to concrete slots.
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

## Hope check-in calls
Daily by default. Pick the slot inside `hope_call_windows` with the highest T_s. Skip slots within 2 h of a visit or call. Retry a missed call after 30 min. With no stats, default to late morning.

## Fallback
If S ∩ F_m is empty for everyone, return the 3 nearest near-misses (window widened ±1 h) flagged "needs a quick OK".
