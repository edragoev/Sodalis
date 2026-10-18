import { after } from 'next/server'
import { getAppUrl } from '@/lib/app-url'
import { getAdminMessaging } from '@/lib/firebase/admin'
import { pushAlertToFamily } from '@/lib/firebase/alert-push'
import type { MulticastMessaging } from '@/lib/firebase/opportunity-push'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { VapiToolsDeps } from './tools'

/** The real collaborators for the tools route. */
export function vapiToolsDeps(): VapiToolsDeps {
  const db = supabaseAdmin()
  return {
    secret: process.env.VAPI_WEBHOOK_SECRET,
    demoSeniorPhone: process.env.DEMO_SENIOR_PHONE,
    async findSeniorByPhone(phone) {
      const { data, error } = await db
        .from('seniors')
        .select('id, name, phone_e164')
        .eq('phone_e164', phone)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    async callHasAlert(vapiCallId) {
      const { count, error } = await db
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('vapi_call_id', vapiCallId)
      if (error) throw new Error(error.message)
      return (count ?? 0) > 0
    },
    async insertAlert(input) {
      const { data, error } = await db.from('alerts').insert(input).select('id').single()
      if (error) throw new Error(error.message)
      return data
    },
    async pushAlert(senior, detail) {
      await pushAlertToFamily(
        { db, messaging: getAdminMessaging() as unknown as MulticastMessaging, appUrl: getAppUrl(process.env) },
        senior.id,
        { seniorName: senior.name, seniorPhone: senior.phone_e164, detail },
      )
    },
    after,
  }
}
