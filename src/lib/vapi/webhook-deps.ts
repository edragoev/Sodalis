import { after } from 'next/server'
import { insertCheckIn } from '@/lib/check-ins'
import { coordinateOpportunity } from '@/lib/coordinator/deps'
import { pendingExtraction, planEvents } from '@/lib/event-planner/deps'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { VapiWebhookDeps } from './webhook'

/** The real collaborators for the webhook route. */
export function vapiWebhookDeps(): VapiWebhookDeps {
  const db = supabaseAdmin()
  return {
    secret: process.env.VAPI_WEBHOOK_SECRET,
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
    async propose(opportunityId) {
      await coordinateOpportunity(opportunityId)
    },
    async extract(checkInId) {
      return planEvents(checkInId)
    },
    pendingExtraction,
    after,
    now: () => new Date(),
  }
}
