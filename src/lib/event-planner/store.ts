import type { SupabaseClient } from '@supabase/supabase-js'
import { DEDUP_DAYS, MIN_CONFIDENCE, type NewOpportunity, type Outcome, type PlannerCheckIn, type PlannerContext, type PlannerDeps } from './plan'

// The planner's reads and writes against Supabase (service-role client, server only).

// Never select phone, fcm_token or google_refresh_token: member data is sent to Gemini.
const MEMBER_COLUMNS = 'id, name, relationship, pronouns'
const POSTGRES_UNIQUE_VIOLATION = '23505'

// Generic messages on purpose: a database error could quote data that should not reach a log or a caller.
const fail = (what: string) => new Error(`Could not ${what}`)

const firstName = (name: unknown) => (typeof name === 'string' ? name.trim().split(/\s+/)[0] : '') || 'your loved one'

export function createPlannerStore(db: SupabaseClient): Pick<PlannerDeps, 'load' | 'saveIdeas' | 'openIds' | 'saveResult' | 'outcomes'> {
  async function load(checkInId: string): Promise<PlannerContext | null> {
    const { data: checkIn, error } = await db
      .from('check_ins')
      .select('id, senior_id, vapi_call_id, transcript, started_at, ended_at, raw_extraction')
      .eq('id', checkInId)
      .maybeSingle()
    if (error) throw fail('load the check-in')
    if (!checkIn) return null

    const since = new Date(Date.now() - DEDUP_DAYS * 86_400_000).toISOString()
    const [senior, members, recent] = await Promise.all([
      db.from('seniors').select('name, timezone').eq('id', checkIn.senior_id).maybeSingle(),
      db.from('family_members').select(MEMBER_COLUMNS).eq('senior_id', checkIn.senior_id),
      db.from('opportunities').select('type, mentioned_member_id, mentioned_item').eq('senior_id', checkIn.senior_id).gte('created_at', since),
    ])
    if (senior.error || members.error || recent.error) throw fail('load the family')

    return {
      checkIn: checkIn as PlannerCheckIn,
      senior: { first_name: firstName(senior.data?.name), timezone: senior.data?.timezone ?? 'UTC' },
      members: (members.data ?? []).map((m) => ({ id: m.id, name: m.name, relationship: m.relationship ?? '', pronouns: m.pronouns ?? null })),
      recent: recent.data ?? [],
    }
  }

  async function saveIdeas(checkIn: PlannerCheckIn, rows: NewOpportunity[]) {
    for (const row of rows) {
      const { error } = await db.from('opportunities').insert({
        ...row,
        senior_id: checkIn.senior_id,
        check_in_id: checkIn.id,
        check_in_vapi_call_id: checkIn.vapi_call_id,
        source: 'extraction',
      })
      // The same call, type and member already has a row: a repeat run, so leave it alone.
      if (error && error.code !== POSTGRES_UNIQUE_VIOLATION) throw fail('save an opportunity')
    }
  }

  async function openIds(checkInId: string): Promise<string[]> {
    const { data, error } = await db
      .from('opportunities')
      .select('id, confidence')
      .eq('check_in_id', checkInId)
      .eq('source', 'extraction')
      .eq('status', 'detected')
    if (error) throw fail('list the opportunities')
    return (data ?? []).filter((r) => r.confidence == null || Number(r.confidence) >= MIN_CONFIDENCE).map((r) => r.id as string)
  }

  async function saveResult(checkInId: string, record: Record<string, unknown>) {
    const { error } = await db.from('check_ins').update({ raw_extraction: record }).eq('id', checkInId)
    if (error) throw fail('save the extraction')
  }

  async function outcomes(ids: string[]): Promise<Outcome[]> {
    if (ids.length === 0) return []
    const { data, error } = await db.from('opportunities').select('id, status, notified_member_ids, proposed_slots').in('id', ids)
    if (error) throw fail('read the proposals')
    return (data ?? []).map((o) => ({
      id: o.id,
      status: o.status,
      notified_member_ids: o.notified_member_ids ?? [],
      proposed_slots: o.proposed_slots ?? [],
    }))
  }

  return { load, saveIdeas, openIds, saveResult, outcomes }
}
