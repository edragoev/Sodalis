import { quoteInTranscript } from '@/lib/event-planner/validate'
import { CATEGORIES, SAFETY_LEVELS, type Category, type Safety, type WellbeingAlert } from './types'

// Gemini's answer is never trusted. Every field is checked; an alert that fails is dropped on its own,
// except a serious one: those are kept (as needs_review) so a concern is never silently discarded.

export const MAX_ALERTS = 5
const MAX_SUMMARY = 300
const MAX_QUOTE = 200
const MAX_SUPPORT = 200
const MAX_FOLLOWUP = 300
/** Written when the elder asked for nothing; we never invent a follow-up. */
const UNKNOWN = 'Unknown'

export type DropReason =
  | 'not_an_object'
  | 'bad_category'
  | 'bad_summary'
  | 'bad_quote'
  | 'quote_not_in_transcript'
  | 'bad_support'
  | 'bad_followup'
  | 'bad_safety'
  | 'bad_confidence'

export type Parsed =
  | { ok: true; alerts: WellbeingAlert[]; dropped: { index: number; reason: DropReason }[] }
  | { ok: false; reason: 'invalid_output' }

// Words that must never end up as a routine alert. Only a floor: Gemini may still choose a higher level.
const SERIOUS =
  /\b(?:fell|fallen|falls?|fell over|couldn'?t get up|can'?t get up|unable to get up|chest pain|can'?t breathe|unconscious|passed out|faint(?:ed)?|bleeding|head injury|hit (?:his|her|my|their) head|suicid\w*|kill (?:myself|himself|herself)|end (?:my|it all)|(?:want|wish) (?:to be|i was) dead|hurt(?:ing)? myself|self[- ]harm|abus\w*|hits? me|hit me|afraid of|unsafe|stranger in)\b/i

const RANK: Record<Safety, number> = { routine: 0, needs_review: 1, urgent: 2 }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' && v.trim().length <= max ? v.trim() : null)
const clip = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const isSerious = (...parts: string[]) => SERIOUS.test(parts.join(' '))
const floor = (safety: Safety, serious: boolean): Safety => (serious && RANK[safety] < RANK.needs_review ? 'needs_review' : safety)

function validateAlert(raw: unknown, ctx: { transcript: string }): WellbeingAlert | { reason: DropReason; raw: unknown } {
  if (!isObject(raw)) return { reason: 'not_an_object', raw }
  const fail = (reason: DropReason) => ({ reason, raw })

  if (!oneOf(CATEGORIES, raw.category)) return fail('bad_category')
  const summary = text(raw.summary, MAX_SUMMARY)
  if (!summary) return fail('bad_summary')
  const quote = text(raw.quote, MAX_QUOTE)
  if (!quote) return fail('bad_quote')
  if (!quoteInTranscript(quote, ctx.transcript)) return fail('quote_not_in_transcript')

  const support = raw.support_needed === '' || raw.support_needed === null || raw.support_needed === undefined ? 'unknown' : text(raw.support_needed, MAX_SUPPORT)
  if (support === null) return fail('bad_support')
  const noFollowup = raw.suggested_followup === null || raw.suggested_followup === undefined || (typeof raw.suggested_followup === 'string' && raw.suggested_followup.trim() === '')
  const followup = noFollowup ? UNKNOWN : text(raw.suggested_followup, MAX_FOLLOWUP)
  if (followup === null) return fail('bad_followup')
  if (!oneOf(SAFETY_LEVELS, raw.safety)) return fail('bad_safety')
  const confidence = raw.confidence
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return fail('bad_confidence')

  return {
    category: raw.category,
    summary,
    quote,
    support_needed: support,
    suggested_followup: followup,
    safety: floor(raw.safety, isSerious(quote, summary)),
    confidence,
  }
}

/** A malformed alert is not discarded when its (verified) quote is serious: keep the quote for human review. */
function salvage(raw: unknown, ctx: { transcript: string }): WellbeingAlert | null {
  if (!isObject(raw)) return null
  const quote = clip(raw.quote, MAX_QUOTE)
  if (!quote || !quoteInTranscript(quote, ctx.transcript) || !isSerious(quote)) return null
  const level = oneOf(SAFETY_LEVELS, raw.safety) ? raw.safety : 'needs_review'
  return {
    category: oneOf(CATEGORIES, raw.category) ? (raw.category as Category) : 'other',
    summary: clip(raw.summary, MAX_SUMMARY) ?? 'The elder said something that may need a closer look.',
    quote,
    support_needed: 'unknown',
    suggested_followup: UNKNOWN,
    safety: floor(level, true),
    confidence: typeof raw.confidence === 'number' && raw.confidence >= 0 && raw.confidence <= 1 ? raw.confidence : 0.5,
  }
}

/** Checks Gemini's whole answer: `{ alerts: [...] }`. A bad envelope fails the call; a bad alert is dropped. */
export function parseWellbeing(raw: unknown, ctx: { transcript: string }): Parsed {
  if (!isObject(raw) || !Array.isArray(raw.alerts)) return { ok: false, reason: 'invalid_output' }

  const dropped: { index: number; reason: DropReason }[] = []
  const byQuote = new Map<string, WellbeingAlert>()
  raw.alerts.forEach((item, index) => {
    const result = validateAlert(item, ctx)
    let alert: WellbeingAlert | null
    if ('reason' in result) {
      alert = result.reason === 'quote_not_in_transcript' ? null : salvage(result.raw, ctx)
      if (!alert) dropped.push({ index, reason: result.reason })
    } else alert = result
    if (!alert) return
    const key = squash(alert.quote)
    const existing = byQuote.get(key)
    if (!existing || RANK[alert.safety] > RANK[existing.safety]) byQuote.set(key, existing && RANK[existing.safety] > RANK[alert.safety] ? existing : alert)
  })

  const alerts = [...byQuote.values()].sort((a, b) => RANK[b.safety] - RANK[a.safety]).slice(0, MAX_ALERTS)
  return { ok: true, alerts, dropped }
}
