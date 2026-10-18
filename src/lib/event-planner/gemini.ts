import { GoogleGenAI, Type } from '@google/genai'
import { backoffFor } from '@/lib/gemini-backoff'
import { KINDS, OPPORTUNITY_TYPES, URGENCIES, type ExtractionInput } from './types'

// The single Gemini call per phone call (specs/03-ai/hope-persona.md "Gemini Flash extraction schema",
// reduced to the part this feature uses: opportunities[]). Model id from GEMINI_MODEL.

export const GEMINI_TIMEOUT_MS = 20_000

const nullableString = { type: Type.STRING, nullable: true }

export const responseSchema = {
  type: Type.OBJECT,
  properties: {
    opportunities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: [...OPPORTUNITY_TYPES] },
          summary: { type: Type.STRING },
          quote: { type: Type.STRING },
          mentioned_member: nullableString,
          mentioned_item: nullableString,
          interest_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          target_date: nullableString,
          urgency: { type: Type.STRING, enum: [...URGENCIES] },
          confidence: { type: Type.NUMBER },
          suggested_kind: { type: Type.STRING, enum: [...KINDS] },
        },
        required: ['type', 'summary', 'quote', 'mentioned_member', 'mentioned_item', 'interest_tags', 'target_date', 'urgency', 'confidence', 'suggested_kind'],
      },
    },
  },
  required: ['opportunities'],
}

/** The instructions and data for the call. Pure, so the privacy rules in it can be tested. */
export function buildPrompt({ transcript, senior, today, members }: ExtractionInput): string {
  const family = members.map((m) => `- ${m.name} (${m.relationship}; pronouns ${m.pronouns ?? 'they/them'})`).join('\n') || '- (none)'
  return [
    `Below is the transcript of a phone call between Hope, a friendly AI companion, and ${senior.first_name}, an older adult.`,
    'Find things that a family member could do for or with them: bring something, do an activity together,',
    'be there for a dated event, or get in touch. Return them as opportunities.',
    '',
    'Types: gift_errand (something they have or need that a relative can bring or fetch), activity (something to do together),',
    'event (a time-anchored moment such as a birthday), wants_contact (they want to see or hear from someone).',
    '',
    'Rules:',
    '- Only use what the transcript says. Do not invent anything. If nothing qualifies, return an empty list.',
    '- quote: a short phrase copied word for word from what the elder said.',
    '- mentioned_member: the name or relationship word the elder used ("Danny", "my grandchild"), or null. Never guess one.',
    '- Health, pain, illness, mood, distress and safety are NOT opportunities. Leave them out entirely.',
    `- target_date: YYYY-MM-DD, only when the elder gave or clearly implied a date. Today is ${today} (${senior.timezone}). Otherwise null.`,
    '- confidence: 0 to 1, how sure you are that the elder meant it. urgency: low, normal or high (high when a date is near or they are out of a necessity).',
    '- suggested_kind: call when they want to hear a voice or distance makes a visit unlikely; otherwise visit.',
    '- Write summary in one neutral sentence, never about their health.',
    '',
    `Family members:\n${family}`,
    '',
    'Transcript:',
    transcript,
  ].join('\n')
}

// While Gemini's quota is refused, nobody asks again (this server instance), as in lib/profile.ts.
let quotaBlockedUntil = 0

/** Asks Gemini once and returns the parsed JSON. Throws on any failure; the planner records it. */
export async function extractWithGemini(input: ExtractionInput): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL
  if (!apiKey || !model) throw new Error('Gemini env vars are not set')
  if (quotaBlockedUntil > Date.now()) throw new Error('Gemini quota is exhausted; waiting before asking again')

  // One attempt: on the free tier a refused call would otherwise retry for minutes.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: GEMINI_TIMEOUT_MS, retryOptions: { attempts: 1 } } })
  try {
    const res = await ai.models.generateContent({
      model,
      contents: buildPrompt(input),
      config: { responseMimeType: 'application/json', responseSchema, temperature: 0 },
    })
    return JSON.parse(res.text ?? '')
  } catch (err) {
    const { waitMs, quota } = backoffFor(err)
    if (quota) quotaBlockedUntil = Date.now() + waitMs
    throw err
  }
}
