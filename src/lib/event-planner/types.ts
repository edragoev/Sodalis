// The event planner turns a finished call's transcript into opportunities
// (specs/06-notifications/conversation-to-visit.md sections 1-3, specs/03-ai/hope-persona.md).

export const OPPORTUNITY_TYPES = ['gift_errand', 'activity', 'event', 'wants_contact'] as const
export const URGENCIES = ['low', 'normal', 'high'] as const
export const KINDS = ['visit', 'call'] as const

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number]

/** One validated idea from Gemini. Nothing here has been matched to a member yet. */
export interface ExtractedIdea {
  type: OpportunityType
  summary: string
  quote: string
  mentioned_member: string | null
  mentioned_item: string | null
  /** A short verb phrase for the push title ("Bake apple pie"), or null when Gemini gave none usable. */
  activity: string | null
  interest_tags: string[]
  /** 'YYYY-MM-DD' in the elder's timezone, or null when no usable date was given. */
  target_date: string | null
  urgency: (typeof URGENCIES)[number]
  confidence: number
  suggested_kind: (typeof KINDS)[number]
}

export interface PlannerMember {
  id: string
  name: string
  relationship: string
  pronouns: string | null
}

/** What Gemini is told about the call. No phone numbers, tokens or calendar contents. */
export interface ExtractionInput {
  transcript: string
  senior: { first_name: string; timezone: string }
  /** The senior's local date when the call ended, 'YYYY-MM-DD'. Relative dates ("Tuesday") resolve from it. */
  today: string
  members: Pick<PlannerMember, 'name' | 'relationship' | 'pronouns'>[]
}
