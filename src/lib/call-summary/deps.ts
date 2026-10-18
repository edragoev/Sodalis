import { supabaseAdmin } from '@/lib/supabase/server'
import { GEMINI_TIMEOUT_MS, summarizeCall } from './gemini'
import { createCallSummarizer, type SummaryCheckIn, type SummaryResult } from './run'

const RUN_TIMEOUT_MS = GEMINI_TIMEOUT_MS + 2_000

// Generic messages on purpose: a database error could quote data that should not reach a log.
const fail = (what: string) => new Error(`Could not ${what}`)

const firstName = (name: unknown) => (typeof name === 'string' ? name.trim().split(/\s+/)[0] : '') || 'your loved one'

/** Summarises one saved check-in against the real database and Gemini. */
export function summarizeCheckIn(checkInId: string): Promise<SummaryResult> {
  const db = supabaseAdmin()
  return createCallSummarizer({
    async load(id) {
      const { data: checkIn, error } = await db
        .from('check_ins')
        .select('id, senior_id, transcript, started_at, ended_at, mood_label')
        .eq('id', id)
        .maybeSingle()
      if (error) throw fail('load the check-in')
      if (!checkIn) return null
      const senior = await db.from('seniors').select('name, timezone').eq('id', checkIn.senior_id).maybeSingle()
      if (senior.error) throw fail('load the senior')
      return {
        checkIn: checkIn as SummaryCheckIn,
        senior: { first_name: firstName(senior.data?.name), timezone: senior.data?.timezone ?? 'UTC' },
      }
    },
    summarize: summarizeCall,
    async save(id, summary) {
      const { error } = await db.from('check_ins').update(summary).eq('id', id)
      if (error) throw fail('save the summary')
    },
    now: () => new Date(),
    timeoutMs: RUN_TIMEOUT_MS,
  })(checkInId)
}

/** The check-in to retry when Vapi redelivers a call that was never summarised, else null. */
export async function pendingSummary(vapiCallId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('check_ins')
    .select('id, transcript, mood_label')
    .eq('vapi_call_id', vapiCallId)
    .maybeSingle()
  if (error || !data?.transcript) return null
  return data.mood_label ? null : data.id
}
