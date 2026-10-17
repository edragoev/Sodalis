import { createAdminClient } from '@/utils/supabase/admin'

const REQUIRED = ['senior_id', 'check_in_id', 'type', 'summary'] as const
const OPTIONAL = [
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

const bad = (error: string) => Response.json({ error }, { status: 400 })

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return bad('Request body must be valid JSON')
  }

  for (const field of REQUIRED) {
    const value = body?.[field]
    if (typeof value !== 'string' || value.trim() === '') return bad(`${field} is required`)
  }
  if (!TYPES.includes(body.type as string)) return bad(`type must be one of: ${TYPES.join(', ')}`)

  // Only whitelisted fields; id, status and accepted_by are set by the server.
  const record: Record<string, unknown> = {}
  for (const field of [...REQUIRED, ...OPTIONAL]) {
    if (body[field] !== undefined) record[field] = body[field]
  }

  const { data, error } = await createAdminClient()
    .from('opportunities')
    .insert(record)
    .select()
    .single()

  if (error) {
    // 23503 = foreign key violation: the senior or check-in doesn't exist.
    if (error.code === '23503') return bad('senior_id or check_in_id does not exist')
    return Response.json({ error: 'Could not save the opportunity' }, { status: 500 })
  }
  return Response.json(data, { status: 201 })
}
