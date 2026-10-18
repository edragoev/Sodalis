import { backoffFor } from '@/lib/gemini-backoff'
import { localDate } from '@/lib/event-planner/dates'
import type { SummaryInput } from './gemini'
import { parseCallSummary, type CallSummary } from './validate'

// The post-call summary: one Gemini call over the transcript, validated, then written onto the check-in
// (mood, topics, engagement, summary, open_thread). A check-in that already has a mood_label is done, so a
// redelivered call is not summarised twice; a failed one has none and is tried again. Every collaborator is
// injected, so it needs no database or Gemini.

export interface SummaryCheckIn {
  id: string
  transcript: string | null
  started_at: string
  ended_at: string | null
  mood_label: string | null
}

export interface SummaryContext {
  checkIn: SummaryCheckIn
  senior: { first_name: string; timezone: string }
}

export interface SummaryDeps {
  load(checkInId: string): Promise<SummaryContext | null>
  /** The one Gemini call. Returns its parsed JSON, which is validated here, never trusted. */
  summarize(input: SummaryInput): Promise<unknown>
  save(checkInId: string, summary: CallSummary): Promise<void>
  now(): Date
  timeoutMs: number
}

export type SummaryResult =
  | { status: 'not_found' | 'no_transcript' | 'already_done' }
  | { status: 'failed'; reason: string; quota: boolean }
  | { status: 'done'; summary: CallSummary }

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

export function createCallSummarizer(deps: SummaryDeps) {
  return async function run(checkInId: string): Promise<SummaryResult> {
    const context = await deps.load(checkInId)
    if (!context) return { status: 'not_found' }
    const { checkIn, senior } = context
    const transcript = checkIn.transcript?.trim()
    if (!transcript) return { status: 'no_transcript' }
    if (checkIn.mood_label) return { status: 'already_done' }

    const callEnd = new Date(checkIn.ended_at ?? checkIn.started_at)
    const today = localDate(Number.isNaN(callEnd.getTime()) ? deps.now() : callEnd, senior.timezone)

    const fail = (err: unknown, reason?: string): SummaryResult => ({
      status: 'failed',
      reason: reason ?? errorMessage(err).slice(0, 200),
      quota: backoffFor(err).quota,
    })

    let raw: unknown
    try {
      raw = await withTimeout(deps.summarize({ transcript, senior: { first_name: senior.first_name }, today }), deps.timeoutMs)
    } catch (err) {
      return fail(err, errorMessage(err) === 'timeout' ? 'timeout' : undefined)
    }

    const parsed = parseCallSummary(raw)
    if (!parsed.ok) return fail(new Error(parsed.reason), parsed.reason)

    try {
      await deps.save(checkIn.id, parsed.summary)
    } catch (err) {
      return fail(err, 'could not save the summary')
    }
    return { status: 'done', summary: parsed.summary }
  }
}
