import { after } from 'next/server'
import { insertCheckIn } from '@/lib/check-ins'
import { pendingSummary, summarizeCheckIn } from '@/lib/call-summary/deps'
import { coordinateOpportunity } from '@/lib/coordinator/deps'
import { pendingExtraction, planEvents } from '@/lib/event-planner/deps'
import { supabaseAdmin } from '@/lib/supabase/server'
import { pendingWellbeing, planWellbeing } from '@/lib/wellbeing/deps'
import type { VapiWebhookDeps } from './webhook'

/** The real collaborators for the webhook route. */
export function vapiWebhookDeps(): VapiWebhookDeps {
  const db = supabaseAdmin()
  return {
    secret: process.env.VAPI_WEBHOOK_SECRET,
    demoSeniorPhone: process.env.DEMO_SENIOR_PHONE,
    async findSeniorByPhone(phone) {
      const { data, error } = await db.from('seniors').select('id').eq('phone_e164', phone).maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    insertCheckIn: (input) => insertCheckIn(db, input),
    async linkHopeOpportunities(vapiCallId, checkInId) {
      const { data, error } = await db
        .from('opportunities')
        .update({ check_in_id: checkInId })
        .eq('check_in_vapi_call_id', vapiCallId)
        .is('check_in_id', null)
        .select('id')
      if (error) throw new Error(error.message)
      return (data ?? []).map((row) => row.id as string)
    },
    async linkAlerts(vapiCallId, checkInId) {
      const { error } = await db
        .from('alerts')
        .update({ check_in_id: checkInId })
        .eq('vapi_call_id', vapiCallId)
        .is('check_in_id', null)
      if (error) throw new Error(error.message)
    },
    async propose(opportunityId) {
      await coordinateOpportunity(opportunityId)
    },
    async summarize(checkInId) {
      const result = await summarizeCheckIn(checkInId)
      // The summary keeps no status column, so a failure must reach the logs to be seen at all.
      if (result.status === 'failed') {
        console.error('call summary failed:', result.reason, result.quota ? '(Gemini quota)' : '')
      }
      return result
    },
    pendingSummary,
    async extract(checkInId) {
      return planEvents(checkInId)
    },
    pendingExtraction,
    async wellbeing(checkInId) {
      return planWellbeing(checkInId)
    },
    pendingWellbeing,
    after,
    now: () => new Date(),
  }
}
