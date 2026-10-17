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
  slots: { id: string }[]
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

/** The no-AI answer: the best-matched member (first on the shortlist) and their first 3 slots. */
export function templateFallback(
  opportunity: { id: string; summary: string; quote?: string | null; mentioned_item?: string | null },
  shortlist: ShortlistEntry[],
): Decision {
  const top = shortlist[0]
  const subject = opportunity.mentioned_item?.trim() || opportunity.summary
  // A quote about how the elder feels stays out of the push; the summary stands in for it.
  const quote = opportunity.quote?.trim()
  const said = quote && !mentionsHealth(quote) ? `'${quote}'` : opportunity.summary

  return {
    member_id: top.member_id,
    slot_ids: top.slots.slice(0, MAX_SLOTS).map((s) => s.id),
    title: `A visit idea: ${subject}`,
    body: `${said} Pick a time that suits you.`,
    why: 'Chosen by match score, because the AI suggestion could not be used.',
  }
}
