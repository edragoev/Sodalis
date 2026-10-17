import { supabaseAdmin } from '@/lib/supabase/server'

const REQUIRED = ['senior_id', 'type', 'summary'] as const
const OPTIONAL = [
  'check_in_id',
  'check_in_vapi_call_id',
  'source',
  'quote',
  'mentioned_member_id',
  'mentioned_item',
  'interest_tags',
  'target_date',
  'urgency',
  'confidence',
  'suggested_kind',
] as const
const TYPES = ['gift_errand', 'activity', 'event', 'wants_contact']
const URGENCIES = ['low', 'normal', 'high']
const KINDS = ['visit', 'call']
const SOURCES = ['extraction', 'hope_tool']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bad = (error: string) => Response.json({ error }, { status: 400 })

const isUuid = (v: unknown) => typeof v === 'string' && UUID.test(v)
const isDate = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v))

/** Checks that stop bad values before the database does. Returns an error message or null. */
function validate(body: Record<string, unknown>): string | null {
  for (const field of REQUIRED) {
    const value = body[field]
    if (typeof value !== 'string' || value.trim() === '') return `${field} is required`
  }
  if (!isUuid(body.senior_id)) return 'senior_id must be a UUID'
  // The check-in row may not exist yet (Hope proposes visits mid-call), so a Vapi call id will do.
  const given = (field: string) => body[field] !== undefined && body[field] !== null
  if (!given('check_in_id') && !given('check_in_vapi_call_id'))
    return 'check_in_id or check_in_vapi_call_id is required'
  if (given('check_in_id') && !isUuid(body.check_in_id)) return 'check_in_id must be a UUID'
  if (given('check_in_vapi_call_id')) {
    const id = body.check_in_vapi_call_id
    if (typeof id !== 'string' || id.trim() === '') return 'check_in_vapi_call_id must be a non-empty string'
  }
  if (given('source') && !SOURCES.includes(body.source as string))
    return `source must be one of: ${SOURCES.join(', ')}`
  if (!TYPES.includes(body.type as string)) return `type must be one of: ${TYPES.join(', ')}`

  // Optional fields: absent or null is fine; anything else must be well formed.
  if (given('mentioned_member_id') && !isUuid(body.mentioned_member_id))
    return 'mentioned_member_id must be a UUID'
  if (given('confidence')) {
    const c = body.confidence
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1)
      return 'confidence must be a number between 0 and 1'
  }
  if (given('interest_tags')) {
    const tags = body.interest_tags
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string'))
      return 'interest_tags must be an array of strings'
  }
  if (given('urgency') && !URGENCIES.includes(body.urgency as string))
    return `urgency must be one of: ${URGENCIES.join(', ')}`
  if (given('suggested_kind') && !KINDS.includes(body.suggested_kind as string))
    return `suggested_kind must be one of: ${KINDS.join(', ')}`
  if (given('target_date') && !isDate(body.target_date))
    return 'target_date must be an ISO date such as 2026-10-20'
  return null
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return bad('Request body must be valid JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return bad('Request body must be a JSON object')

  const input = body as Record<string, unknown>
  const problem = validate(input)
  if (problem) return bad(problem)

  // Only whitelisted fields; id, status and accepted_by are set by the server.
  const record: Record<string, unknown> = {}
  for (const field of [...REQUIRED, ...OPTIONAL]) {
    if (input[field] !== undefined) record[field] = input[field]
  }

  const { data, error } = await supabaseAdmin()
    .from('opportunities')
    .insert(record)
    .select()
    .single()

  if (error) {
    // 23503 = foreign key violation (the senior or check-in doesn't exist);
    // 23514 = check constraint. Both are the caller's input, not a server fault.
    // 23505 = unique violation: Hope already proposed this for the same call, member and type.
    if (error.code === '23505')
      return Response.json({ error: 'This opportunity was already created for this call' }, { status: 409 })
    if (error.code === '23503') return bad('senior_id or check_in_id does not exist')
    if (error.code === '23514') return bad('One of the values is out of range')
    return Response.json({ error: 'Could not save the opportunity' }, { status: 500 })
  }
  return Response.json(data, { status: 201 })
}
