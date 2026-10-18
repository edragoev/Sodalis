import type { SupabaseClient } from '@supabase/supabase-js'
import { DEDUP_DAYS, MIN_CONFIDENCE, type NewOpportunity, type Outcome, type PlannerCheckIn, type PlannerContext, type PlannerDeps } from './plan'

// The planner's reads and writes against Supabase (service-role client, server only).

// Never select phone, fcm_token or google_refresh_token: member data is sent to Gemini.
const MEMBER_COLUMNS = 'id, name, relationship, pronouns'
const POSTGRES_UNIQUE_VIOLATION = '23505'
const URGENCY_RANK: Record<string, number> = { low: 0, normal: 1, high: 2 }

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
      // Only ideas a family member was actually asked about count as repeats; one that never got a push must not
      // block the same idea from a later call.
      db
        .from('opportunities')
        .select('type, mentioned_member_id, mentioned_item, activity')
        .eq('senior_id', checkIn.senior_id)
        .in('status', ['proposed', 'confirmed'])
        .gte('created_at', since),
    ])
    if (senior.error || members.error || recent.error) throw fail('load the family')

    return {
      checkIn: checkIn as PlannerCheckIn,
      senior: { first_name: firstName(senior.data?.name), timezone: senior.data?.timezone ?? 'UTC' },
      members: (members.data ?? []).map((m) => ({ id: m.id, name: m.name, relationship: m.relationship ?? '', pronouns: m.pronouns ?? null })),
      recent: recent.data ?? [],
    }
  }

  // The same idea as the table's unique index: call, type, member and item, with "none" counting as one value.
  const slotKey = (r: { type: string; mentioned_member_id: string | null; mentioned_item: string | null }) =>
    `${r.type}|${r.mentioned_member_id ?? ''}|${r.mentioned_item ?? ''}`

  async function alreadySaved(vapiCallId: string): Promise<Set<string>> {
    const { data, error } = await db
      .from('opportunities')
      .select('type, mentioned_member_id, mentioned_item')
      .eq('check_in_vapi_call_id', vapiCallId)
    if (error) throw fail('save the opportunities')
    return new Set((data ?? []).map(slotKey))
  }

  // All of a call's ideas go in with one insert, so a failure saves none of them rather than half. Rows the call
  // already saved (a repeat run) are left out first. If a parallel run saves one in between, the insert hits the
  // unique index; read again and retry once with whatever is still missing.
  async function saveIdeas(checkIn: PlannerCheckIn, rows: NewOpportunity[]) {
    if (rows.length === 0) return
    for (let attempt = 0; attempt < 2; attempt++) {
      const saved = await alreadySaved(checkIn.vapi_call_id)
      const fresh = rows.filter((row) => !saved.has(slotKey(row)))
      if (fresh.length === 0) return
      const { error } = await db.from('opportunities').insert(
        fresh.map((row) => ({
          ...row,
          senior_id: checkIn.senior_id,
          check_in_id: checkIn.id,
          check_in_vapi_call_id: checkIn.vapi_call_id,
          source: 'extraction',
        })),
      )
      if (!error) return
      if (error.code !== POSTGRES_UNIQUE_VIOLATION) break
    }
    throw fail('save the opportunities')
  }

  async function openIds(checkInId: string): Promise<string[]> {
    const { data, error } = await db
      .from('opportunities')
      .select('id, confidence, type, urgency')
      .eq('check_in_id', checkInId)
      .eq('source', 'extraction')
      .eq('status', 'detected')
    if (error) throw fail('list the opportunities')
    // Best first: a concrete plan before a general "wants contact", then the more urgent, then the more certain.
    const score = (r: { confidence: unknown; type: unknown; urgency: unknown }) =>
      (r.type === 'wants_contact' ? 0 : 100) + (URGENCY_RANK[r.urgency as string] ?? 1) * 10 + (r.confidence == null ? 0 : Number(r.confidence))
    return (data ?? [])
      .filter((r) => r.confidence == null || Number(r.confidence) >= MIN_CONFIDENCE)
      .sort((a, b) => score(b) - score(a))
      .map((r) => r.id as string)
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
