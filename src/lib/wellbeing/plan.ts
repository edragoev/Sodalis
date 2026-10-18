import { backoffFor } from '@/lib/gemini-backoff'
import { localDate } from '@/lib/event-planner/dates'
import type { ExtractionInput, Category, Safety, WellbeingAlert } from './types'
import { parseWellbeing, type DropReason } from './validate'

// The post-call wellbeing agent: one Gemini call over the transcript, strict validation, alerts saved in one
// insert, and a push for anything that needs a closer look. Every collaborator is injected, so it needs no
// database, Gemini or Firebase.

export interface WellbeingCheckIn {
  id: string
  senior_id: string
  transcript: string | null
  started_at: string
  ended_at: string | null
  wellbeing_extraction: { status?: string } | null
}

export interface WellbeingContext {
  checkIn: WellbeingCheckIn
  senior: { first_name: string; timezone: string }
}

export type AlertType = 'low_mood' | 'health' | 'wants_contact' | 'wellbeing'
export type AlertSeverity = 'info' | 'warn' | 'urgent'

/** A row for `alerts`; the legacy type, severity and message keep the dashboard working. */
export interface NewAlert {
  type: AlertType
  severity: AlertSeverity
  message: string
  category: Category
  quote: string
  support_needed: string
  suggested_followup: string | null
  safety: Safety
  confidence: number
}

export interface PlannerDeps {
  load(checkInId: string): Promise<WellbeingContext | null>
  /** The one Gemini call. Returns its parsed JSON, which is validated here, never trusted. */
  extract(input: ExtractionInput): Promise<unknown>
  /** Inserts all rows in one statement. A row the call already saved is left alone. */
  saveAlerts(checkIn: WellbeingCheckIn, rows: NewAlert[]): Promise<void>
  saveResult(checkInId: string, record: Record<string, unknown>): Promise<void>
  /** Tells the family there is something to look at. Never carries the alert's content. */
  notify(checkIn: WellbeingCheckIn, level: Exclude<Safety, 'routine'>): Promise<void>
  now(): Date
  timeoutMs: number
}

export type WellbeingResult =
  | { status: 'not_found' | 'no_transcript' | 'already_done' }
  | { status: 'failed'; reason: string; quota: boolean }
  | { status: 'done'; alerts: WellbeingAlert[]; dropped: { index: number; reason: DropReason }[]; notified: Safety | null }

const TYPE_FOR: Record<Category, AlertType> = {
  loneliness: 'low_mood',
  emotional_wellbeing: 'low_mood',
  physical_incident: 'health',
  family_support: 'wants_contact',
  daily_living: 'wellbeing',
  other: 'wellbeing',
}
const SEVERITY_FOR: Record<Safety, AlertSeverity> = { routine: 'info', needs_review: 'warn', urgent: 'urgent' }

export const toRow = (a: WellbeingAlert): NewAlert => ({
  type: TYPE_FOR[a.category],
  severity: SEVERITY_FOR[a.safety],
  message: a.suggested_followup ? `${a.summary} ${a.suggested_followup}` : a.summary,
  category: a.category,
  quote: a.quote,
  support_needed: a.support_needed,
  suggested_followup: a.suggested_followup,
  safety: a.safety,
  confidence: a.confidence,
})

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

export function createWellbeingPlanner(deps: PlannerDeps) {
  return async function plan(checkInId: string, options: { force?: boolean } = {}): Promise<WellbeingResult> {
    const context = await deps.load(checkInId)
    if (!context) return { status: 'not_found' }
    const { checkIn, senior } = context
    const transcript = checkIn.transcript?.trim()
    if (!transcript) return { status: 'no_transcript' }
    // Only a finished extraction blocks a re-run; a failed one is retried (a repeated webhook, or `force`).
    if (checkIn.wellbeing_extraction?.status === 'ok' && !options.force) return { status: 'already_done' }

    const callEnd = new Date(checkIn.ended_at ?? checkIn.started_at)
    const today = localDate(Number.isNaN(callEnd.getTime()) ? deps.now() : callEnd, senior.timezone)

    const fail = async (err: unknown, reason?: string): Promise<WellbeingResult> => {
      const { waitMs, quota } = backoffFor(err)
      const message = reason ?? errorMessage(err).slice(0, 200)
      try {
        await deps.saveResult(checkIn.id, { status: 'failed', reason: message, quota, retry_after_ms: waitMs, at: deps.now().toISOString() })
      } catch (saveErr) {
        console.error('wellbeing: could not record the failure', errorMessage(saveErr))
      }
      return { status: 'failed', reason: message, quota }
    }

    let raw: unknown
    try {
      raw = await withTimeout(deps.extract({ transcript, senior: { first_name: senior.first_name }, today }), deps.timeoutMs)
    } catch (err) {
      return fail(err, errorMessage(err) === 'timeout' ? 'timeout' : undefined)
    }

    const parsed = parseWellbeing(raw, { transcript })
    if (!parsed.ok) return fail(new Error(parsed.reason), parsed.reason)

    try {
      await deps.saveAlerts(checkIn, parsed.alerts.map(toRow))
      // The marker goes in only after the alerts exist, so a crash in between just re-runs safely.
      await deps.saveResult(checkIn.id, { status: 'ok', at: deps.now().toISOString(), count: parsed.alerts.length, dropped: parsed.dropped })
    } catch (err) {
      return fail(err, 'could not save the alerts')
    }

    const level: Exclude<Safety, 'routine'> | null = parsed.alerts.some((a) => a.safety === 'urgent')
      ? 'urgent'
      : parsed.alerts.some((a) => a.safety === 'needs_review')
        ? 'needs_review'
        : null
    if (level) {
      try {
        await deps.notify(checkIn, level)
      } catch (err) {
        console.error('wellbeing: could not notify the family', errorMessage(err))
      }
    }
    return { status: 'done', alerts: parsed.alerts, dropped: parsed.dropped, notified: level }
  }
}
