import type { SupabaseClient } from '@supabase/supabase-js'
import type { NewAlert, PlannerDeps, WellbeingCheckIn, WellbeingContext } from './plan'

// The wellbeing agent's reads and writes against Supabase (service-role client, server only).

const POSTGRES_UNIQUE_VIOLATION = '23505'

// Generic messages on purpose: a database error could quote data that should not reach a log or a caller.
const fail = (what: string) => new Error(`Could not ${what}`)

const firstName = (name: unknown) => (typeof name === 'string' ? name.trim().split(/\s+/)[0] : '') || 'your loved one'

export function createWellbeingStore(db: SupabaseClient): Pick<PlannerDeps, 'load' | 'saveAlerts' | 'saveResult'> {
  async function load(checkInId: string): Promise<WellbeingContext | null> {
    const { data: checkIn, error } = await db
      .from('check_ins')
      .select('id, senior_id, transcript, started_at, ended_at, wellbeing_extraction')
      .eq('id', checkInId)
      .maybeSingle()
    if (error) throw fail('load the check-in')
    if (!checkIn) return null
    const senior = await db.from('seniors').select('name, timezone').eq('id', checkIn.senior_id).maybeSingle()
    if (senior.error) throw fail('load the senior')
    return {
      checkIn: checkIn as WellbeingCheckIn,
      senior: { first_name: firstName(senior.data?.name), timezone: senior.data?.timezone ?? 'UTC' },
    }
  }

  const key = (quote: string) => quote.trim().toLowerCase()

  async function alreadySaved(checkInId: string): Promise<Set<string>> {
    const { data, error } = await db.from('alerts').select('quote').eq('check_in_id', checkInId).eq('source', 'wellbeing')
    if (error) throw fail('save the alerts')
    return new Set((data ?? []).map((r: { quote: string | null }) => key(r.quote ?? '')))
  }

  // All of a call's alerts go in with one insert, so a failure saves none of them rather than half. Rows the call
  // already saved (a repeat run) are left out first. If a parallel run saves one in between, the insert hits the
  // unique index; read again and retry once with whatever is still missing.
  async function saveAlerts(checkIn: WellbeingCheckIn, rows: NewAlert[]) {
    if (rows.length === 0) return
    for (let attempt = 0; attempt < 2; attempt++) {
      const saved = await alreadySaved(checkIn.id)
      const fresh = rows.filter((row) => !saved.has(key(row.quote)))
      if (fresh.length === 0) return
      const { error } = await db
        .from('alerts')
        .insert(fresh.map((row) => ({ ...row, senior_id: checkIn.senior_id, check_in_id: checkIn.id, source: 'wellbeing' })))
      if (!error) return
      if (error.code !== POSTGRES_UNIQUE_VIOLATION) break
    }
    throw fail('save the alerts')
  }

  async function saveResult(checkInId: string, record: Record<string, unknown>) {
    const { error } = await db.from('check_ins').update({ wellbeing_extraction: record }).eq('id', checkInId)
    if (error) throw fail('save the extraction')
  }

  return { load, saveAlerts, saveResult }
}
