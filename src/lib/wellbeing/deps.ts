import { getAppUrl } from '@/lib/app-url'
import { getAdminMessaging } from '@/lib/firebase/admin'
import type { MulticastMessaging } from '@/lib/firebase/opportunity-push'
import { supabaseAdmin } from '@/lib/supabase/server'
import { extractWellbeing, GEMINI_TIMEOUT_MS } from './gemini'
import { createWellbeingPlanner, type WellbeingResult } from './plan'
import { pushWellbeing } from './push'
import { createWellbeingStore } from './store'

const PLANNER_TIMEOUT_MS = 3 * GEMINI_TIMEOUT_MS + 2_000 // two attempts, then one on the fallback model

/** Runs the wellbeing agent for one saved check-in against the real database, Gemini and Firebase. */
export function planWellbeing(checkInId: string, options: { force?: boolean } = {}): Promise<WellbeingResult> {
  const db = supabaseAdmin()
  return createWellbeingPlanner({
    ...createWellbeingStore(db),
    extract: extractWellbeing,
    notify: (checkIn, level) =>
      pushWellbeing({ db, messaging: getAdminMessaging() as unknown as MulticastMessaging, appUrl: getAppUrl(process.env) }, checkIn.senior_id, checkIn.id, level),
    now: () => new Date(),
    timeoutMs: PLANNER_TIMEOUT_MS,
  })(checkInId, options)
}

/** The check-in to retry when Vapi redelivers a call whose wellbeing extraction never finished, else null. */
export async function pendingWellbeing(vapiCallId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('check_ins')
    .select('id, transcript, wellbeing_extraction')
    .eq('vapi_call_id', vapiCallId)
    .maybeSingle()
  if (error || !data?.transcript) return null
  return data.wellbeing_extraction?.status === 'ok' ? null : data.id
}
