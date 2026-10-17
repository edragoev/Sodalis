import type { SupabaseClient } from '@supabase/supabase-js'
import type { CoordinatorContext, CoordinatorDeps, RunRecord } from './run'
import type { ShortlistMember } from './shortlist'

// The coordinator's reads and writes against Supabase (service-role client, server only).

const OPPORTUNITY_COLUMNS =
  'id, senior_id, type, summary, quote, mentioned_member_id, mentioned_item, interest_tags, target_date, urgency, status'

// Never select fcm_token or google_refresh_token here: members' data is sent to Gemini.
const MEMBER_COLUMNS =
  'id, name, relationship, interests, skills, activities_with_elder, conversation_topics, constraints, profile_summary'

// Generic messages on purpose: a database error could quote data that should not reach a log or a caller.
const fail = (what: string) => new Error(`Could not ${what}`)

const firstName = (name: unknown) =>
  (typeof name === 'string' ? name.trim().split(/\s+/)[0] : '') || 'your loved one'

export function createCoordinatorStore(db: SupabaseClient) {
  async function loadContext(opportunityId: string): Promise<CoordinatorContext | null> {
    const { data: opportunity, error } = await db
      .from('opportunities')
      .select(OPPORTUNITY_COLUMNS)
      .eq('id', opportunityId)
      .maybeSingle()
    if (error) throw fail('load the opportunity')
    if (!opportunity) return null

    const [senior, members] = await Promise.all([
      db.from('seniors').select('name, timezone').eq('id', opportunity.senior_id).maybeSingle(),
      db.from('family_members').select(MEMBER_COLUMNS).eq('senior_id', opportunity.senior_id),
    ])
    if (senior.error || members.error) throw fail('load the family')

    return {
      opportunity: {
        id: opportunity.id,
        senior_id: opportunity.senior_id,
        type: opportunity.type,
        summary: opportunity.summary,
        quote: opportunity.quote,
        mentioned_member_id: opportunity.mentioned_member_id,
        mentioned_item: opportunity.mentioned_item,
        interest_tags: opportunity.interest_tags ?? [],
        target_date: opportunity.target_date,
        urgency: opportunity.urgency,
        status: opportunity.status,
      },
      senior: { first_name: firstName(senior.data?.name), timezone: senior.data?.timezone ?? 'UTC' },
      members: (members.data ?? []).map(
        (m): ShortlistMember => ({
          id: m.id,
          name: m.name,
          relationship: m.relationship,
          interests: m.interests ?? [],
          skills: m.skills ?? [],
          activities_with_elder: m.activities_with_elder ?? [],
          conversation_topics: m.conversation_topics ?? [],
          constraints: m.constraints ?? {},
          profile_summary: m.profile_summary ?? null,
        }),
      ),
    }
  }

  const saveProposal: CoordinatorDeps['saveProposal'] = async (opportunityId, proposal) => {
    // Only a still-detected opportunity changes, so two runs cannot both claim it and both push.
    const { data, error } = await db
      .from('opportunities')
      .update({ status: 'proposed', ...proposal })
      .eq('id', opportunityId)
      .eq('status', 'detected')
      .select('id')
    if (error) throw fail('save the proposal')
    if (!data || data.length === 0) throw new Error('The opportunity is no longer open')
  }

  async function recordRun(run: RunRecord): Promise<void> {
    const { error } = await db.from('agent_runs').insert({
      opportunity_id: run.opportunity_id,
      step: 1,
      tool: 'coordinate',
      args: run.input ?? {},
      result: {
        ...(run.output && { output: run.output }),
        ...(run.fallback_reason && { fallback_reason: run.fallback_reason }),
        ...(run.reason && { reason: run.reason }),
      },
      used_fallback: run.used_fallback ?? false,
    })
    if (error) throw fail('record the run')
  }

  return { loadContext, saveProposal, recordRun }
}
