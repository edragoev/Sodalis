import type { SupabaseClient } from '@supabase/supabase-js'

// What Soladis knows when a call starts: the values for the {{...}} placeholders in the
// assistant's prompt and first message, read from Supabase (sent as assistantOverrides.variableValues).

export interface CallVariables {
  senior_name: string
  today: string
  family_summary: string
  last_topics: string
  open_thread: string
  [key: string]: string
}

export interface CallContextInput {
  senior: { name: string; timezone?: string | null }
  family: { name: string; relationship?: string | null; pronouns?: string | null }[]
  lastCheckIn?: { topics?: string[] | null } | null
}

const NONE = 'none'

/** "Sunday, October 18" in the senior's timezone (UTC when it is missing or unknown). */
function formatToday(now: Date, timezone?: string | null): string {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }
  try {
    return now.toLocaleDateString('en-US', { ...options, timeZone: timezone || 'UTC' })
  } catch {
    return now.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' })
  }
}

/** "Sarah (daughter, she/her); Tom (son)". Pronouns appear only when the member set them. */
function familySummary(family: CallContextInput['family']): string {
  const people = family.map((m) => {
    const details = [m.relationship?.trim().toLowerCase(), m.pronouns?.trim()].filter(Boolean)
    return details.length > 0 ? `${m.name} (${details.join(', ')})` : m.name
  })
  return people.length > 0 ? people.join('; ') : NONE
}

export function buildCallVariables(input: CallContextInput, now: Date): CallVariables {
  const topics = input.lastCheckIn?.topics?.filter((t) => t.trim() !== '') ?? []
  return {
    senior_name: input.senior.name,
    today: formatToday(now, input.senior.timezone),
    family_summary: familySummary(input.family),
    last_topics: topics.length > 0 ? topics.join(', ') : NONE,
    // Not extracted yet; the prompt skips the follow-up when it says "none".
    open_thread: NONE,
  }
}

export interface SeniorToCall {
  id: string
  name: string
  phone_e164: string
  variables: CallVariables
}

/** Reads the senior, their family and their latest completed check-in, and builds the call variables. */
export async function loadSeniorToCall(db: SupabaseClient, seniorId: string, now: Date): Promise<SeniorToCall> {
  const { data: senior, error } = await db
    .from('seniors')
    .select('id, name, phone_e164, timezone, family_members(name, relationship, pronouns)')
    .eq('id', seniorId)
    .single()
  if (error) throw new Error(`Could not load the senior: ${error.message}`)

  const { data: lastCheckIn, error: checkInError } = await db
    .from('check_ins')
    .select('topics')
    .eq('senior_id', seniorId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (checkInError) throw new Error(`Could not load the last check-in: ${checkInError.message}`)

  return {
    id: senior.id,
    name: senior.name,
    phone_e164: senior.phone_e164,
    variables: buildCallVariables({ senior, family: senior.family_members ?? [], lastCheckIn }, now),
  }
}
