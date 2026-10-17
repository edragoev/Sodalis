import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpportunityData } from './opportunity-view'

// Reads what /opportunities/[id] shows. Runs in the browser with the anon client (SELECT only).

const COLUMNS =
  'id, senior_id, type, summary, quote, mentioned_item, urgency, status, accepted_by, proposed_slots'

/** The opportunity with the family's names and the elder's timezone, or null if there is none. */
export async function loadOpportunity(db: SupabaseClient, id: string): Promise<OpportunityData | null> {
  // Generic message on purpose: a database error should not reach the screen.
  const fail = () => new Error('Could not load the opportunity')

  const { data: opportunity, error } = await db.from('opportunities').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw fail()
  if (!opportunity) return null

  const [senior, members] = await Promise.all([
    db.from('seniors').select('timezone').eq('id', opportunity.senior_id).maybeSingle(),
    db.from('family_members').select('id, name').eq('senior_id', opportunity.senior_id),
  ])
  if (senior.error || members.error) throw fail()

  return {
    opportunity: opportunity as OpportunityData['opportunity'],
    members: members.data ?? [],
    timezone: senior.data?.timezone ?? 'UTC',
  }
}
