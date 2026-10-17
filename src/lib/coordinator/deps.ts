import { getAppUrl } from '@/lib/app-url'
import { getAdminMessaging } from '@/lib/firebase/admin'
import type { MulticastMessaging } from '@/lib/firebase/opportunity-push'
import { createGetSlots } from '@/lib/scheduler/get-slots'
import { createSchedulerLoader } from '@/lib/scheduler/load'
import { supabaseAdmin } from '@/lib/supabase/server'
import { pushContentToMembers } from './push'
import { createCoordinator, type CoordinatorResult } from './run'
import { createCoordinatorStore } from './store'

const SLOT_DAYS = 7
const GEMINI_TIMEOUT_MS = 5000

/** Runs the coordinator for one opportunity against the real database and Firebase. */
export function coordinateOpportunity(opportunityId: string): Promise<CoordinatorResult> {
  const db = supabaseAdmin()
  const store = createCoordinatorStore(db)
  const slotsFor = createGetSlots({ load: createSchedulerLoader(db), now: () => new Date() })

  return createCoordinator({
    ...store,
    getSlots: (memberId, opportunity) =>
      slotsFor(memberId, opportunity.suggested_kind === 'call' ? 'call' : 'visit', SLOT_DAYS, {
        targetDate: opportunity.target_date,
        perishable: opportunity.type === 'gift_errand',
      }),
    // No AI call yet: this always fails, so every run uses the template message and the push still goes out.
    chooseWithGemini: async () => {
      throw new Error('Gemini is not configured')
    },
    push: (memberIds, content) =>
      pushContentToMembers(
        { db, messaging: getAdminMessaging() as unknown as MulticastMessaging, appUrl: getAppUrl(process.env) },
        memberIds,
        content,
      ),
    timeoutMs: GEMINI_TIMEOUT_MS,
  })(opportunityId)
}
