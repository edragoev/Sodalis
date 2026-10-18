import { mentionsHealth } from '@/lib/coordinator/validate'
import { normalizeTargetDate } from './dates'
import { KINDS, OPPORTUNITY_TYPES, URGENCIES, type ExtractedIdea } from './types'

// Gemini's answer is never trusted (specs/06-notifications/conversation-to-visit.md section 3). Every field is
// checked here; an idea that fails any check is dropped on its own, and the rest of the call still counts.

export const MAX_IDEAS = 5
const MAX_SUMMARY = 300
const MAX_QUOTE = 200
const MAX_TAGS = 8
const MAX_TAG = 40
const MAX_ACTIVITY = 40

export type DropReason =
  | 'not_an_object'
  | 'bad_type'
  | 'bad_summary'
  | 'bad_quote'
  | 'quote_not_in_transcript'
  | 'bad_member'
  | 'bad_item'
  | 'bad_tags'
  | 'bad_urgency'
  | 'bad_confidence'
  | 'bad_kind'
  | 'health_in_summary'
  | 'too_many'

export type Parsed =
  | { ok: true; ideas: ExtractedIdea[]; dropped: { index: number; reason: DropReason }[] }
  | { ok: false; reason: 'invalid_output' }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' && v.trim().length <= max ? v.trim() : null)
const optionalText = (v: unknown, max: number): string | null | undefined =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? null : text(v, max) ?? undefined

/** Lowercase letters and digits only, so punctuation and spacing differences don't hide a real quote. */
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** The quote must be something the elder actually said, so a made-up line can never reach the family. */
export const quoteInTranscript = (quote: string, transcript: string) => squash(transcript).includes(squash(quote))

function validateIdea(raw: unknown, ctx: { transcript: string; today: string }): ExtractedIdea | DropReason {
  if (!isObject(raw)) return 'not_an_object'
  if (!oneOf(OPPORTUNITY_TYPES, raw.type)) return 'bad_type'
  const summary = text(raw.summary, MAX_SUMMARY)
  if (!summary) return 'bad_summary'
  const quote = text(raw.quote, MAX_QUOTE)
  if (!quote) return 'bad_quote'
  if (!quoteInTranscript(quote, ctx.transcript)) return 'quote_not_in_transcript'
  const member = optionalText(raw.mentioned_member, 80)
  if (member === undefined) return 'bad_member'
  const item = optionalText(raw.mentioned_item, 80)
  if (item === undefined) return 'bad_item'

  if (!Array.isArray(raw.interest_tags) || raw.interest_tags.length > MAX_TAGS) return 'bad_tags'
  const tags: string[] = []
  for (const t of raw.interest_tags) {
    const tag = text(t, MAX_TAG)
    if (!tag) return 'bad_tags'
    tags.push(tag.toLowerCase())
  }

  if (!oneOf(URGENCIES, raw.urgency)) return 'bad_urgency'
  const confidence = raw.confidence
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return 'bad_confidence'
  if (!oneOf(KINDS, raw.suggested_kind)) return 'bad_kind'
  // Health and safety are alerts, not visit ideas, and the summary is what a push falls back to.
  if (mentionsHealth(summary)) return 'health_in_summary'

  // Only the push title uses it, so a bad one is dropped (the title falls back to "Visit") rather than the idea.
  const rawActivity = typeof raw.activity === 'string' ? raw.activity.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/, '') : ''
  const activity =
    rawActivity && rawActivity.length <= MAX_ACTIVITY && !mentionsHealth(rawActivity)
      ? rawActivity[0].toUpperCase() + rawActivity.slice(1)
      : null

  return {
    type: raw.type,
    summary,
    quote,
    mentioned_member: member,
    mentioned_item: item,
    activity,
    interest_tags: [...new Set(tags)],
    target_date: normalizeTargetDate(raw.target_date, ctx.today),
    urgency: raw.urgency,
    confidence,
    suggested_kind: raw.suggested_kind,
  }
}

/** Checks Gemini's whole answer: `{ opportunities: [...] }`. A bad envelope fails the call; a bad idea is dropped. */
export function parseExtraction(raw: unknown, ctx: { transcript: string; today: string }): Parsed {
  if (!isObject(raw) || !Array.isArray(raw.opportunities)) return { ok: false, reason: 'invalid_output' }
  const ideas: ExtractedIdea[] = []
  const dropped: { index: number; reason: DropReason }[] = []
  raw.opportunities.forEach((item, index) => {
    const result = validateIdea(item, ctx)
    if (typeof result === 'string') dropped.push({ index, reason: result })
    else if (ideas.length >= MAX_IDEAS) dropped.push({ index, reason: 'too_many' })
    else ideas.push(result)
  })
  return { ok: true, ideas, dropped }
}
