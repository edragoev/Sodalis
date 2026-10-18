import type { Window } from '@/lib/availability'
import { computeSlots, type Interval, type Kind, type OpportunityTweaks, type Slot } from './slots'

// getSlots(member, kind, days) is what Hope's tools and the coordinator call
// (specs/04-scheduler/algorithm.md "Interface"). Loading is injected, so the availability source can change
// (the manual grid today, Google Calendar free/busy later) without touching the slot math.

export interface SchedulerData {
  timezone: string
  freeWindows: Window[]
  busyWindows?: Interval[]
  visits: Interval[]
  hopeCalls: Interval[]
}

export interface GetSlotsDeps {
  /** Everything needed for this member, or null when there is no such member. */
  load(memberId: string): Promise<SchedulerData | null>
  now(): Date
}

export function createGetSlots(deps: GetSlotsDeps) {
  return async function getSlots(
    memberId: string,
    kind: Kind,
    days: number,
    opportunity?: OpportunityTweaks,
  ): Promise<Slot[]> {
    // A loading error is thrown, not turned into [], which would read as "nobody is free".
    const data = await deps.load(memberId)
    if (!data) return []
    return computeSlots({ ...data, memberId, now: deps.now(), days, kind, opportunity })
  }
}
