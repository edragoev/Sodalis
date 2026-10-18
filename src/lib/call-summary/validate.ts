// Checks Gemini's call summary before it is saved: small problems are fixed (scores clamped into range,
// text trimmed and capped, topics de-duplicated), and an answer missing what the dashboard needs is refused.

export interface CallSummary {
  mood_score: number | null
  mood_label: string
  topics: string[]
  engagement_score: number
  summary: string
  open_thread: string | null
}

export type ParseResult = { ok: true; summary: CallSummary } | { ok: false; reason: string }

const MAX_TOPICS = 5
const MAX_TOPIC_LENGTH = 40
const MAX_LABEL_LENGTH = 30
const MAX_SUMMARY_LENGTH = 600
const MAX_THREAD_LENGTH = 200

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (n: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, n)) * 100) / 100
const cleanText = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max).trim() : '')

export function parseCallSummary(raw: unknown): ParseResult {
  if (!isObject(raw)) return { ok: false, reason: 'not an object' }

  const summary = cleanText(raw.summary, MAX_SUMMARY_LENGTH)
  if (!summary) return { ok: false, reason: 'summary is missing' }

  const label = cleanText(raw.mood_label, MAX_LABEL_LENGTH).toLowerCase()
  if (!label) return { ok: false, reason: 'mood_label is missing' }

  if (!isNumber(raw.engagement_score)) return { ok: false, reason: 'engagement_score is not a number' }
  if (raw.mood_score !== null && !isNumber(raw.mood_score)) return { ok: false, reason: 'mood_score is not a number' }

  const topics = Array.isArray(raw.topics)
    ? [...new Set(raw.topics.map((t) => cleanText(t, MAX_TOPIC_LENGTH).toLowerCase()).filter(Boolean))].slice(0, MAX_TOPICS)
    : []

  return {
    ok: true,
    summary: {
      mood_score: raw.mood_score === null ? null : clamp(raw.mood_score, -1, 1),
      mood_label: label,
      topics,
      engagement_score: clamp(raw.engagement_score, 0, 1),
      summary,
      open_thread: cleanText(raw.open_thread, MAX_THREAD_LENGTH) || null,
    },
  }
}
