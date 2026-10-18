import type { CheckInInput } from '@/lib/check-ins'
import { bad, readJsonObject } from '@/lib/http'
import { secretMatches } from '@/lib/shared-secret'

// POST /api/vapi/webhook, `end-of-call-report` (specs/02-api/routes.md "Webhook flow").
// The handler only orchestrates; every collaborator is injected so it can be tested without a database.
// Not here yet: Gemini mood/topic/flag analysis and alerts. The event planner (opportunities from the
// transcript) runs after the response, through `extract`.

export interface VapiWebhookDeps {
  /** Shared secret Vapi sends in x-vapi-secret. When unset, every request is refused. */
  secret?: string
  findSeniorByPhone(phone: string): Promise<{ id: string } | null>
  insertCheckIn(input: CheckInInput): Promise<{ id: string }>
  /** Ties the opportunities Hope created during the call to the new check-in; returns their ids. */
  linkHopeOpportunities(vapiCallId: string, checkInId: string): Promise<string[]>
  propose(opportunityId: string): Promise<void>
  /** The event planner for a saved check-in: finds opportunities in the transcript and proposes them. */
  extract?(checkInId: string): Promise<unknown>
  /** For a redelivered call: the check-in whose extraction never finished, or null. */
  pendingExtraction?(vapiCallId: string): Promise<string | null>
  /** Runs work after the response is sent (next/server `after`). */
  after(task: () => Promise<void>): void
  now(): Date
}

const NO_ANSWER_REASONS = new Set(['customer-did-not-answer', 'voicemail', 'customer-busy'])
const FAILED_REASON = /error|failed/i
const POSTGRES_UNIQUE_VIOLATION = '23505'

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

function validDate(v: unknown): Date | null {
  const s = text(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Runs the planner after the response; it records its own failures, so nothing here may throw. */
async function runPlanner(deps: VapiWebhookDeps, checkInId: string) {
  if (!deps.extract) return
  try {
    await deps.extract(checkInId)
  } catch (err) {
    console.error('vapi webhook: the event planner failed', (err as Error).message)
  }
}

async function retryExtraction(deps: VapiWebhookDeps, callId: string) {
  if (!deps.extract || !deps.pendingExtraction) return
  try {
    const checkInId = await deps.pendingExtraction(callId)
    if (checkInId) deps.after(() => runPlanner(deps, checkInId))
  } catch (err) {
    console.error('vapi webhook: could not check for unfinished extraction', (err as Error).message)
  }
}

export function createVapiWebhook(deps: VapiWebhookDeps) {
  return async function POST(request: Request): Promise<Response> {
    if (!secretMatches(deps.secret, request.headers.get('x-vapi-secret'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readJsonObject(request)
    if (body instanceof Response) return body

    const message = body.message
    if (!isObject(message)) return bad('message is required')
    if (message.type !== 'end-of-call-report') return Response.json({ ok: true, ignored: true })

    const call = isObject(message.call) ? message.call : {}
    const customer = isObject(call.customer) ? call.customer : {}
    const callId = text(call.id)
    const number = text(customer.number)
    if (!callId) return bad('call.id is required')
    if (!number) return bad('call.customer.number is required')

    // Vapi retries on anything but 2xx, so an unknown number is acknowledged and dropped.
    const senior = await deps.findSeniorByPhone(number)
    if (!senior) return Response.json({ ok: true, ignored: true })

    const endedReason = text(message.endedReason) ?? ''
    const status: CheckInInput['status'] = NO_ANSWER_REASONS.has(endedReason)
      ? 'no_answer'
      : FAILED_REASON.test(endedReason)
        ? 'failed'
        : 'completed'

    const startedAt = validDate(message.startedAt) ?? deps.now()
    const endedAt = validDate(message.endedAt)
    const seconds = endedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000) : -1

    const artifact = isObject(message.artifact) ? message.artifact : {}
    const transcript = status === 'no_answer' ? undefined : text(artifact.transcript)
    const summary = status === 'no_answer' ? undefined : text(message.summary)

    const checkIn: CheckInInput = {
      senior_id: senior.id,
      vapi_call_id: callId,
      started_at: startedAt.toISOString(),
      ...(endedAt && { ended_at: endedAt.toISOString() }),
      ...(seconds >= 0 && { duration_s: seconds }),
      status,
      ...(transcript && { transcript }),
      ...(summary && { summary }),
    }

    let saved: { id: string }
    try {
      saved = await deps.insertCheckIn(checkIn)
    } catch (err) {
      if ((err as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
        // The check-in exists. If the first delivery died before the planner finished, finish the job now.
        await retryExtraction(deps, callId)
        return Response.json({ ok: true, duplicate: true })
      }
      console.error('vapi webhook: could not save the check-in', (err as Error).message)
      return Response.json({ error: 'Could not save the check-in' }, { status: 500 })
    }

    if (status !== 'no_answer') {
      let opportunityIds: string[] = []
      try {
        opportunityIds = await deps.linkHopeOpportunities(callId, saved.id)
      } catch (err) {
        // The call is already saved; linking can be repaired later, the transcript cannot.
        console.error('vapi webhook: could not link the opportunities', (err as Error).message)
      }

      const planFor = transcript && deps.extract ? saved.id : null
      if (opportunityIds.length > 0 || planFor) {
        deps.after(async () => {
          for (const id of opportunityIds) {
            try {
              await deps.propose(id)
            } catch (err) {
              console.error('vapi webhook: could not propose an opportunity', id, (err as Error).message)
            }
          }
          if (planFor) await runPlanner(deps, planFor)
        })
      }
    }

    return Response.json({ ok: true, check_in_id: saved.id })
  }
}
