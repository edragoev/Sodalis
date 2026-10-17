import { buildShortlist, type ShortlistMember, type ShortlistOpportunity } from './shortlist'
import { templateFallback, validateDecision, type Decision } from './validate'

// One coordinator run for an opportunity: shortlist, slots, one Gemini call, validation, fallback, push
// (specs/08-agents/coordinator-agent.md). Every collaborator is injected, so it needs no database or network.

export interface Slot {
  id: string
  starts_at: string
  ends_at: string
}

export interface CoordinatorOpportunity extends ShortlistOpportunity {
  senior_id: string
  summary: string
  quote: string | null
  mentioned_item: string | null
  urgency: 'low' | 'normal' | 'high'
  status: string
}

export interface CoordinatorContext {
  opportunity: CoordinatorOpportunity
  senior: { first_name: string; timezone: string }
  members: ShortlistMember[]
}

export interface GeminiInput {
  senior: { first_name: string }
  opportunity: Pick<CoordinatorOpportunity, 'type' | 'quote' | 'summary' | 'interest_tags' | 'urgency' | 'mentioned_item'>
  members: {
    member_id: string
    name: string
    relationship: string
    interests: string[]
    skills: string[]
    activities_with_elder: string[]
    conversation_topics: string[]
    profile_summary: string | null
    slots: Slot[]
  }[]
}

export interface PushContent {
  opportunity_id: string
  title: string
  body: string
  urgency: CoordinatorOpportunity['urgency']
  slot_ids: string[]
  timezone: string
}

export interface RunRecord {
  opportunity_id: string
  input?: GeminiInput
  output?: Decision
  used_fallback?: boolean
  fallback_reason?: string
  reason?: string
}

export interface CoordinatorDeps {
  loadContext(opportunityId: string): Promise<CoordinatorContext | null>
  getSlots(memberId: string, opportunity: CoordinatorOpportunity): Promise<Slot[]>
  /** Returns Gemini's raw answer; it is validated here, never trusted. */
  chooseWithGemini(input: GeminiInput): Promise<unknown>
  /** Stores the slots and notified members and sets the opportunity to `proposed`. */
  saveProposal(opportunityId: string, proposal: { notified_member_ids: string[]; proposed_slots: Slot[] }): Promise<void>
  push(memberIds: string[], content: PushContent): Promise<{ successCount: number; failureCount: number }>
  recordRun(run: RunRecord): Promise<void>
  timeoutMs: number
}

export type CoordinatorResult =
  | { status: 'not_found' | 'skipped' | 'no_slots' }
  | { status: 'proposed'; usedFallback: boolean; pushed: boolean }

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

type Entry = { member: ShortlistMember; slots: Slot[] }

function buildGeminiInput({ opportunity, senior }: CoordinatorContext, entries: Entry[]): GeminiInput {
  return {
    senior: { first_name: senior.first_name },
    opportunity: {
      type: opportunity.type,
      quote: opportunity.quote,
      summary: opportunity.summary,
      interest_tags: opportunity.interest_tags,
      urgency: opportunity.urgency,
      mentioned_item: opportunity.mentioned_item,
    },
    members: entries.map(({ member: m, slots }) => ({
      member_id: m.id,
      name: m.name,
      relationship: m.relationship,
      interests: m.interests,
      skills: m.skills,
      activities_with_elder: m.activities_with_elder,
      conversation_topics: m.conversation_topics,
      profile_summary: m.profile_summary,
      slots,
    })),
  }
}

/** Asks Gemini and validates the answer. No decision means the caller uses the template, and why. */
async function chooseDecision(
  deps: Pick<CoordinatorDeps, 'chooseWithGemini' | 'timeoutMs'>,
  input: GeminiInput,
  shortlist: { member_id: string; slots: Slot[] }[],
): Promise<{ decision?: Decision; fallbackReason?: string }> {
  try {
    const raw = await withTimeout(deps.chooseWithGemini(input), deps.timeoutMs)
    const verdict = validateDecision(raw, shortlist)
    return verdict.ok ? { decision: raw as Decision } : { fallbackReason: `invalid: ${verdict.reason}` }
  } catch (err) {
    return { fallbackReason: errorMessage(err) === 'timeout' ? 'timeout' : `error: ${errorMessage(err)}` }
  }
}

export function createCoordinator(deps: CoordinatorDeps) {
  // The trace is for the dashboard; losing it must never lose the push.
  const record = async (run: RunRecord) => {
    try {
      await deps.recordRun(run)
    } catch (err) {
      console.error('coordinator: could not write the run', errorMessage(err))
    }
  }

  return async function coordinate(opportunityId: string): Promise<CoordinatorResult> {
    const context = await deps.loadContext(opportunityId)
    if (!context) return { status: 'not_found' }
    const { opportunity, senior, members } = context
    // Only a fresh opportunity is proposed, so a retried call never sends a second push.
    if (opportunity.status !== 'detected') return { status: 'skipped' }

    const entries: Entry[] = []
    for (const member of buildShortlist(opportunity, members)) {
      const slots = await deps.getSlots(member.id, opportunity)
      if (slots.length > 0) entries.push({ member, slots })
    }
    if (entries.length === 0) {
      await record({ opportunity_id: opportunity.id, reason: 'no_slots' })
      return { status: 'no_slots' }
    }

    const shortlist = entries.map((e) => ({ member_id: e.member.id, slots: e.slots }))
    const input = buildGeminiInput(context, entries)
    const { decision, fallbackReason } = await chooseDecision(deps, input, shortlist)
    const usedFallback = !decision
    const final = decision ?? templateFallback(opportunity, shortlist)

    const chosen = entries.find((e) => e.member.id === final.member_id)!
    const slots = final.slot_ids.map((id) => chosen.slots.find((s) => s.id === id)!)

    // The page a tap opens reads the saved proposal, so it must exist before the push goes out.
    await deps.saveProposal(opportunity.id, { notified_member_ids: [final.member_id], proposed_slots: slots })

    let pushed = false
    try {
      const result = await deps.push([final.member_id], {
        opportunity_id: opportunity.id,
        title: final.title,
        body: final.body,
        urgency: opportunity.urgency,
        slot_ids: final.slot_ids,
        timezone: senior.timezone,
      })
      pushed = result.successCount > 0
    } catch (err) {
      console.error('coordinator: the push failed', errorMessage(err))
    }

    await record({
      opportunity_id: opportunity.id,
      input,
      output: final,
      used_fallback: usedFallback,
      ...(fallbackReason && { fallback_reason: fallbackReason }),
    })
    return { status: 'proposed', usedFallback, pushed }
  }
}
