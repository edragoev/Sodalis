// The wellbeing agent turns a finished call's transcript into alerts for the family dashboard
// (specs/03-ai/hope-persona.md "Wellbeing alerts").

export const CATEGORIES = ['loneliness', 'emotional_wellbeing', 'physical_incident', 'daily_living', 'family_support', 'other'] as const
export const SAFETY_LEVELS = ['routine', 'needs_review', 'urgent'] as const

export type Category = (typeof CATEGORIES)[number]
export type Safety = (typeof SAFETY_LEVELS)[number]

/** One validated alert from Gemini. */
export interface WellbeingAlert {
  category: Category
  summary: string
  /** Verbatim from the transcript. */
  quote: string
  /** What help the conversation points to, or 'unknown'. */
  support_needed: string
  /** What the elder asked for, in their words, or 'Unknown'. Never our own advice. */
  suggested_followup: string
  safety: Safety
  confidence: number
}

/** How the elder seemed across the whole call, for the dashboard's mood face and trend. */
export interface Mood {
  /** -1 (very low) to 1 (very happy); null when they said too little to tell. */
  score: number | null
  /** One or two lowercase words, such as "cheerful" or "a bit low". */
  label: string
}

/** What Gemini is told about the call. No phone numbers, tokens or family details. */
export interface ExtractionInput {
  transcript: string
  senior: { first_name: string }
  /** The senior's local date when the call ended, 'YYYY-MM-DD'. */
  today: string
}
