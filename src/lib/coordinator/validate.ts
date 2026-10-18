// Code checks Gemini's answer before anything is sent (specs/08-agents/coordinator-agent.md "Validation").

export interface Decision {
  member_id: string
  slot_ids: string[]
  title: string
  body: string
  why: string
}

export interface ShortlistEntry {
  member_id: string
  slots: { id: string; starts_at?: string }[]
}

export type Validation =
  | { ok: true }
  | { ok: false; reason: 'invalid_output' | 'member_not_on_shortlist' | 'slot_not_for_member' | 'health_mentioned' }

const MAX_SLOTS = 3

// The elder's health never goes in a push: how they feel, pain, illness, medication. A keyword list
// catches the obvious words; "fall" counts only as a noun ("her fall"), not "fell in love".
const HEALTH =
  /\b(?:medication|medicine|prescription|blood pressure|diagnos\w*|illness|unwell|sick|injur\w*|dizz\w*|hurts?|hurting|pain\w*|aches?|aching|sore|not feeling (?:well|great|good)|under the weather|(?:her|his|their|a) falls?)\b/i

/** True when the text talks about the elder's health. */
export const mentionsHealth = (text: string) => HEALTH.test(text)

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

export function validateDecision(decision: unknown, shortlist: ShortlistEntry[]): Validation {
  const invalid = { ok: false, reason: 'invalid_output' } as const
  if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return invalid
  const d = decision as Partial<Decision>

  if (typeof d.member_id !== 'string') return invalid
  const entry = shortlist.find((e) => e.member_id === d.member_id)
  if (!entry) return { ok: false, reason: 'member_not_on_shortlist' }

  const ids = d.slot_ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_SLOTS) return invalid
  if (new Set(ids).size !== ids.length) return invalid
  const own = new Set(entry.slots.map((s) => s.id))
  if (!ids.every((id) => typeof id === 'string' && own.has(id))) return { ok: false, reason: 'slot_not_for_member' }

  if (!isText(d.title) || !isText(d.body) || !isText(d.why)) return invalid
  if (mentionsHealth(d.title) || mentionsHealth(d.body) || mentionsHealth(d.why)) {
    return { ok: false, reason: 'health_mentioned' }
  }
  return { ok: true }
}

/**
 * The push title: "{activity} with {elder}?", or "to {elder}?" for something to bring ("Bring extra tomatoes to
 * Jane?"). Without a usable activity (older ideas, or one that mentions health) it is "Visit with Jane?" or
 * "Call with Jane?" from the suggested kind.
 */
export function pushTitle(
  opportunity: { type?: string; activity?: string | null; suggested_kind?: string | null },
  elderName: string,
): string {
  const activity = opportunity.activity?.trim()
  if (activity && !mentionsHealth(activity)) {
    return `${activity} ${opportunity.type === 'gift_errand' ? 'to' : 'with'} ${elderName}?`
  }
  return `${opportunity.suggested_kind === 'call' ? 'Call' : 'Visit'} with ${elderName}?`
}

/** The push body: just what to do. The quote and the times are on the page the tap opens. FCM needs a body. */
export const PUSH_BODY = 'Tap to pick a time.'

/** The no-AI answer: the best-matched member (first on the shortlist), their first 3 slots and the fixed push text. */
export function templateFallback(
  opportunity: {
    id: string
    summary: string
    type?: string
    activity?: string | null
    suggested_kind?: string | null
  },
  shortlist: ShortlistEntry[],
  senior: { first_name: string; timezone: string },
): Decision {
  const top = shortlist[0]
  const slots = top.slots.slice(0, MAX_SLOTS)
  return {
    member_id: top.member_id,
    slot_ids: slots.map((s) => s.id),
    title: pushTitle(opportunity, senior.first_name),
    body: PUSH_BODY,
    why: 'Chosen by match score, because the AI suggestion could not be used.',
  }
}
