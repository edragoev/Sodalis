import { backoffFor } from '@/lib/gemini-backoff'
import { localDate } from './dates'
import { matchMentionedMember } from './members'
import type { ExtractedIdea, ExtractionInput, PlannerMember } from './types'
import { parseExtraction, type DropReason } from './validate'

// The post-call event planner (specs/06-notifications/conversation-to-visit.md section 1, steps 2-6):
// one Gemini call over the transcript, strict validation, member matching, saved opportunities, then the
// coordinator for each. Every collaborator is injected, so it needs no database, Gemini or Firebase.

/** Ideas below this are saved for the dashboard but never pushed (conversation-to-visit section 3). */
export const MIN_CONFIDENCE = 0.6
export const DEDUP_DAYS = 7

export interface PlannerCheckIn {
  id: string
  senior_id: string
  vapi_call_id: string
  transcript: string | null
  started_at: string
  ended_at: string | null
  raw_extraction: { status?: string } | null
}

export interface RecentOpportunity {
  type: string
  mentioned_member_id: string | null
  mentioned_item: string | null
  activity?: string | null
}

export interface PlannerContext {
  checkIn: PlannerCheckIn
  senior: { first_name: string; timezone: string }
  members: PlannerMember[]
  /** The senior's opportunities from the last 7 days, including ones Hope created during the call. */
  recent: RecentOpportunity[]
}

export interface NewOpportunity {
  type: ExtractedIdea['type']
  summary: string
  quote: string
  mentioned_member_id: string | null
  mentioned_item: string | null
  activity: string | null
  interest_tags: string[]
  target_date: string | null
  urgency: ExtractedIdea['urgency']
  confidence: number
  suggested_kind: ExtractedIdea['suggested_kind']
}

export interface Outcome {
  id: string
  status: string
  notified_member_ids: string[]
  proposed_slots: { id: string; starts_at: string; ends_at: string }[]
}

export interface PlannerDeps {
  load(checkInId: string): Promise<PlannerContext | null>
  /** The one Gemini call. Returns its parsed JSON, which is validated here, never trusted. */
  extract(input: ExtractionInput): Promise<unknown>
  /** Inserts rows tied to the check-in. A row that already exists (same call, type, member) is left alone. */
  saveIdeas(checkIn: PlannerCheckIn, rows: NewOpportunity[]): Promise<void>
  /** This check-in's extracted opportunities still `detected` and confident enough to propose, best first. */
  openIds(checkInId: string): Promise<string[]>
  /** Marks the check-in's extraction as done or failed. */
  saveResult(checkInId: string, record: Record<string, unknown>): Promise<void>
  /** Runs the coordinator, which picks slots, writes the push and sets `proposed`. True when it was proposed. */
  propose(opportunityId: string): Promise<boolean | void>
  outcomes(ids: string[]): Promise<Outcome[]>
  now(): Date
  timeoutMs: number
}

export interface PlannedIdea {
  type: string
  summary: string
  quote: string
  target_date: string | null
  confidence: number
  mentioned_member: string | null
  /** Who the elder meant: a family member id, or null when unnamed, unknown or ambiguous. */
  matched_member_id: string | null
  member_note: 'unknown_member' | 'ambiguous_member' | null
  /** duplicate: the same idea already exists; covered: a specific plan in this call already answers this wish. */
  skipped: 'duplicate' | 'covered' | null
}

export type PlannerResult =
  | { status: 'not_found' | 'no_transcript' | 'already_done' }
  | { status: 'failed'; reason: string; quota: boolean }
  | {
      status: 'done'
      ideas: PlannedIdea[]
      dropped: { index: number; reason: DropReason }[]
      /** What the coordinator did with each open opportunity: its chosen member(s) and slots. */
      proposals: (Outcome & { member_names: string[] })[]
    }

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))
const norm = (s: string | null) => (s ?? '').trim().toLowerCase()

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

/**
 * One push per wish: a general "wants contact" idea is dropped when the same call also has a specific plan
 * (activity, event, gift or errand) for the same member, or for anyone when the wish names no one, because
 * that plan already answers it ("I miss Sarah" + "we used to bake together" is one push: bake with Sarah).
 */
function coveredByPlan(row: NewOpportunity, rows: NewOpportunity[]): boolean {
  if (row.type !== 'wants_contact') return false
  return rows.some(
    (other) => other.type !== 'wants_contact' && (row.mentioned_member_id === null || other.mentioned_member_id === row.mentioned_member_id),
  )
}

/**
 * Same type and item (or, with no item, the same activity and member) is the same idea (section 8), so
 * "go fishing" is not a repeat of "bake cookies" just because neither names an item or a person.
 */
function sameIdea(
  a: { type: string; mentioned_item: string | null; mentioned_member_id: string | null; activity?: string | null },
  b: typeof a,
) {
  if (a.type !== b.type) return false
  const [x, y] = [norm(a.mentioned_item), norm(b.mentioned_item)]
  if (x || y) return x === y
  const [p, q] = [norm(a.activity ?? null), norm(b.activity ?? null)]
  if ((p || q) && p !== q) return false
  return a.mentioned_member_id === b.mentioned_member_id
}

export function createEventPlanner(deps: PlannerDeps) {
  return async function plan(checkInId: string, options: { force?: boolean } = {}): Promise<PlannerResult> {
    const context = await deps.load(checkInId)
    if (!context) return { status: 'not_found' }
    const { checkIn, senior, members } = context
    const transcript = checkIn.transcript?.trim()
    if (!transcript) return { status: 'no_transcript' }
    // Only a finished extraction blocks a re-run; a failed one is retried (a repeated webhook, or `force`).
    if (checkIn.raw_extraction?.status === 'ok' && !options.force) return { status: 'already_done' }

    const callEnd = new Date(checkIn.ended_at ?? checkIn.started_at)
    const today = localDate(Number.isNaN(callEnd.getTime()) ? deps.now() : callEnd, senior.timezone)

    const fail = async (err: unknown, reason?: string): Promise<PlannerResult> => {
      const { waitMs, quota } = backoffFor(err)
      const message = reason ?? errorMessage(err).slice(0, 200)
      try {
        await deps.saveResult(checkIn.id, { status: 'failed', reason: message, quota, retry_after_ms: waitMs, at: deps.now().toISOString() })
      } catch (saveErr) {
        console.error('event planner: could not record the failure', errorMessage(saveErr))
      }
      return { status: 'failed', reason: message, quota }
    }

    let raw: unknown
    try {
      raw = await withTimeout(
        deps.extract({
          transcript,
          senior,
          today,
          members: members.map(({ name, relationship, pronouns }) => ({ name, relationship, pronouns })),
        }),
        deps.timeoutMs,
      )
    } catch (err) {
      return fail(err, errorMessage(err) === 'timeout' ? 'timeout' : undefined)
    }

    const parsed = parseExtraction(raw, { transcript, today })
    if (!parsed.ok) return fail(new Error(parsed.reason), parsed.reason)

    const ideas: PlannedIdea[] = []
    const rows: NewOpportunity[] = []
    const seen: Parameters<typeof sameIdea>[0][] = [...context.recent]
    const candidates: { planned: PlannedIdea; row: NewOpportunity }[] = []

    // "I miss Sarah" and "we love baking" in one call is baking with Sarah: a plan that names no one goes to
    // the one person the elder said she wants to see, so the push reaches her rather than the best match.
    const wanted = new Set(
      parsed.ideas.flatMap((idea) => {
        if (idea.type !== 'wants_contact') return []
        const match = matchMentionedMember(idea.mentioned_member, members)
        return match.kind === 'one' ? [match.member.id] : []
      }),
    )
    const wantedId = wanted.size === 1 ? [...wanted][0] : null

    for (const idea of parsed.ideas) {
      const match = matchMentionedMember(idea.mentioned_member, members)
      // Section 12: an unknown name is treated as unnamed and noted; so is an ambiguous one, because a single
      // opportunity can name only one member and two bookings for one idea would double-book the elder.
      const memberNote = idea.mentioned_member && match.kind === 'none' ? 'unknown_member' : match.kind === 'several' ? 'ambiguous_member' : null
      const memberId =
        match.kind === 'one' ? match.member.id : !idea.mentioned_member && idea.type !== 'wants_contact' ? wantedId : null
      const row: NewOpportunity = {
        type: idea.type,
        summary: memberNote ? `${idea.summary} (The elder mentioned "${idea.mentioned_member}".)` : idea.summary,
        quote: idea.quote,
        mentioned_member_id: memberId,
        mentioned_item: idea.mentioned_item,
        activity: idea.activity,
        interest_tags: idea.interest_tags,
        target_date: idea.target_date,
        urgency: idea.urgency,
        confidence: idea.confidence,
        suggested_kind: idea.suggested_kind,
      }
      const duplicate = seen.some((s) => sameIdea(s, row))
      const planned: PlannedIdea = {
        type: idea.type,
        summary: idea.summary,
        quote: idea.quote,
        target_date: idea.target_date,
        confidence: idea.confidence,
        mentioned_member: idea.mentioned_member,
        matched_member_id: memberId,
        member_note: memberNote,
        skipped: duplicate ? 'duplicate' : null,
      }
      ideas.push(planned)
      if (!duplicate) {
        candidates.push({ planned, row })
        seen.push(row)
      }
    }

    // After the loop, so a specific plan later in the call still covers an earlier general wish.
    const callRows = candidates.map((c) => c.row)
    for (const { planned, row } of candidates) {
      if (coveredByPlan(row, callRows)) planned.skipped = 'covered'
      else rows.push(row)
    }

    try {
      await deps.saveIdeas(checkIn, rows)
      // The marker goes in only after the opportunities exist, so a crash in between just re-runs safely.
      await deps.saveResult(checkIn.id, {
        status: 'ok',
        at: deps.now().toISOString(),
        ideas: parsed.ideas,
        dropped: parsed.dropped,
      })
    } catch (err) {
      return fail(err, 'could not save the opportunities')
    }

    // One push per call: the best idea. If it can't be proposed (no free times), the next one is tried.
    const open = await deps.openIds(checkIn.id)
    for (const id of open) {
      try {
        if (await deps.propose(id)) break
      } catch (err) {
        console.error('event planner: could not propose an opportunity', id, errorMessage(err))
      }
    }
    const names = new Map(members.map((m) => [m.id, m.name]))
    const proposals = (await deps.outcomes(open)).map((o) => ({
      ...o,
      member_names: o.notified_member_ids.map((id) => names.get(id)).filter((n): n is string => !!n),
    }))

    return { status: 'done', ideas, dropped: parsed.dropped, proposals }
  }
}
