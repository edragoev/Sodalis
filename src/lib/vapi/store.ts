import type { SupabaseClient } from '@supabase/supabase-js'

const fail = (what: string) => new Error(`Could not ${what}`)

export async function findSeniorByPhone(
  db: SupabaseClient,
  phone: string,
): Promise<{ id: string } | null> {
  const { data, error } = await db.from('seniors').select('id').eq('phone_e164', phone).maybeSingle()
  if (error) throw fail('look up the senior by phone')
  return data ?? null
}

export async function linkHopeOpportunities(
  db: SupabaseClient,
  vapiCallId: string,
  checkInId: string,
): Promise<string[]> {
  const attach = await db
    .from('opportunities')
    .update({ check_in_id: checkInId })
    .eq('check_in_vapi_call_id', vapiCallId)
    .is('check_in_id', null)
    .select('id, confidence, status')

  if (attach.error) throw fail('attach Hope opportunities')

  const ready = (attach.data ?? [])
    .filter((row) => row.status === 'detected')
    .filter((row) => row.confidence == null || Number(row.confidence) >= 0.6)
    .map((row) => row.id as string)

  return ready
}
