import type { SupabaseClient } from '@supabase/supabase-js'

export interface CheckInInput {
  senior_id: string
  vapi_call_id: string
  started_at: string
  ended_at?: string
  duration_s?: number
  status?: 'completed' | 'no_answer' | 'failed'
  transcript?: string
  summary?: string
  mood_score?: number
  mood_label?: string
  topics?: string[]
  engagement_score?: number
  flags?: Record<string, unknown>
  raw_extraction?: Record<string, unknown>
}

export interface CheckInRow extends CheckInInput {
  id: string
}

/**
 * Inserts a check-in. A repeated vapi_call_id violates the unique constraint
 * and throws an error whose `code` is Postgres' '23505'.
 */
export async function insertCheckIn(db: SupabaseClient, input: CheckInInput): Promise<CheckInRow> {
  const { data, error } = await db.from('check_ins').insert(input).select().single()
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return data as CheckInRow
}

/** A senior's check-ins, newest first. */
export async function listCheckIns(db: SupabaseClient, seniorId: string): Promise<CheckInRow[]> {
  const { data, error } = await db
    .from('check_ins')
    .select('*')
    .eq('senior_id', seniorId)
    .order('started_at', { ascending: false })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return (data ?? []) as CheckInRow[]
}
