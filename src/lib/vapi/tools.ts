import { readJsonObject } from '@/lib/http'
import { secretMatches } from '@/lib/shared-secret'

// POST /api/vapi/tools: Soladis's in-call tool calls (specs/08-agents/hope-tools.md).
// flag_concern is the only tool. It saves an urgent alert at once and, after replying, pushes to the
// family: once per call, however many times Soladis flags. Vapi waits for the reply before Soladis
// speaks again, so every tool call gets "ok", even when something fails; the post-call extraction
// still has the transcript.

export type ConcernType = 'health' | 'safety'

export interface Senior {
  id: string
  name: string
  phone_e164: string
}

export interface AlertInput {
  senior_id: string
  type: ConcernType
  severity: 'urgent'
  message: string
  vapi_call_id: string
}

export interface VapiToolsDeps {
  /** Shared secret Vapi sends in x-vapi-secret. When unset, every request is refused. */
  secret?: string
  /** Demo only (DEMO_SENIOR_PHONE): the senior a web call belongs to, as in the webhook. */
  demoSeniorPhone?: string
  findSeniorByPhone(phone: string): Promise<Senior | null>
  /** Whether this call already raised an alert, so its family was already pushed. */
  callHasAlert(vapiCallId: string): Promise<boolean>
  insertAlert(input: AlertInput): Promise<{ id: string }>
  pushAlert(senior: Senior, detail: string): Promise<void>
  /** Runs work after the response is sent (next/server `after`). */
  after(task: () => Promise<void>): void
}

const OK = 'ok'
// Used when Soladis calls the tool without saying what happened.
const NO_DETAIL = 'Soladis heard a possible emergency'

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)

/** Vapi sends arguments as an object, though some models send a JSON string. */
function parseArguments(raw: unknown): Json {
  if (isObject(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return isObject(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

interface ToolCall {
  id: string
  name?: string
  args: Json
}

function readToolCalls(message: Json): ToolCall[] {
  const list = Array.isArray(message.toolCallList) ? message.toolCallList : []
  return list.filter(isObject).flatMap((call) => {
    const id = text(call.id)
    if (!id) return []
    const fn = isObject(call.function) ? call.function : call
    return [{ id, name: text(fn.name), args: parseArguments(fn.arguments ?? fn.parameters) }]
  })
}

export function createVapiTools(deps: VapiToolsDeps) {
  return async function POST(request: Request): Promise<Response> {
    if (!secretMatches(deps.secret, request.headers.get('x-vapi-secret'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readJsonObject(request)
    if (body instanceof Response) return body

    const message = isObject(body.message) ? body.message : {}
    if (message.type !== 'tool-calls') return Response.json({ ok: true, ignored: true })

    const toolCalls = readToolCalls(message)
    const results = toolCalls.map((call) => ({ toolCallId: call.id, result: OK }))
    const concerns = toolCalls.filter((call) => call.name === 'flag_concern')
    if (concerns.length === 0) return Response.json({ results })

    try {
      await flagConcerns(deps, message, concerns)
    } catch (err) {
      console.error('vapi tools: could not flag the concern', (err as Error).message)
    }
    return Response.json({ results })
  }
}

async function flagConcerns(deps: VapiToolsDeps, message: Json, concerns: ToolCall[]) {
  const call = isObject(message.call) ? message.call : {}
  const customer = isObject(call.customer) ? call.customer : {}
  const callId = text(call.id)
  const number = text(customer.number) ?? (call.type === 'webCall' ? text(deps.demoSeniorPhone) : undefined)
  if (!callId || !number) {
    console.error('vapi tools: flag_concern without a call id or phone number')
    return
  }

  const senior = await deps.findSeniorByPhone(number)
  if (!senior) {
    console.error('vapi tools: flag_concern for an unknown phone number')
    return
  }

  const alreadyPushed = await deps.callHasAlert(callId)
  for (const concern of concerns) {
    // When in doubt it is a health concern: both kinds are urgent, so this only labels it.
    const type: ConcernType = concern.args.type === 'safety' ? 'safety' : 'health'
    const detail = text(concern.args.detail) ?? NO_DETAIL
    try {
      await deps.insertAlert({ senior_id: senior.id, type, severity: 'urgent', message: detail, vapi_call_id: callId })
    } catch (err) {
      console.error('vapi tools: could not save the alert', (err as Error).message)
    }
  }

  // Pushed even if saving failed: the family hearing about it matters more than the row.
  if (alreadyPushed) return
  const detail = text(concerns[0].args.detail) ?? NO_DETAIL
  deps.after(async () => {
    try {
      await deps.pushAlert(senior, detail)
    } catch (err) {
      console.error('vapi tools: could not push the alert', (err as Error).message)
    }
  })
}
