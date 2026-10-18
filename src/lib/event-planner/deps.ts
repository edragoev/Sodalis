import { coordinateOpportunity } from '@/lib/coordinator/deps'
import { supabaseAdmin } from '@/lib/supabase/server'
import { extractWithGemini, GEMINI_TIMEOUT_MS } from './gemini'
import { createEventPlanner, type PlannerResult } from './plan'
import { createPlannerStore } from './store'

// Room for the coordinator's own 5 s limit and the database work inside the route's 60 s.
const PLANNER_TIMEOUT_MS = GEMINI_TIMEOUT_MS + 2_000

/** Runs the event planner for one saved check-in against the real database, Gemini and Firebase. */
export function planEvents(checkInId: string, options: { force?: boolean } = {}): Promise<PlannerResult> {
  return createEventPlanner({
    ...createPlannerStore(supabaseAdmin()),
    extract: extractWithGemini,
    propose: async (id) => {
      await coordinateOpportunity(id)
    },
    now: () => new Date(),
    timeoutMs: PLANNER_TIMEOUT_MS,
  })(checkInId, options)
}

/** The check-in to retry when Vapi redelivers a call whose extraction never finished, else null. */
export async function pendingExtraction(vapiCallId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('check_ins')
    .select('id, transcript, raw_extraction')
    .eq('vapi_call_id', vapiCallId)
    .maybeSingle()
  if (error || !data?.transcript) return null
  return data.raw_extraction?.status === 'ok' ? null : data.id
}
