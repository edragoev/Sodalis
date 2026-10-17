import { bad, isUuid, readJsonObject } from '@/lib/http'
import { supabaseAdmin } from '@/lib/supabase/server'

const MAX_SLOT_ID = 100

type Outcome = {
  outcome?: string
  visit_id?: string
  covered_by?: string | null
}

// A member confirms a proposed slot. First accept wins: the database function claims the
// opportunity and books the visit in one transaction (see confirm_opportunity_slot).
export async function POST(request: Request) {
  const body = await readJsonObject(request)
  if (body instanceof Response) return body

  const { opportunity_id, member_id, slot_id } = body
  if (!isUuid(opportunity_id)) return bad('opportunity_id must be a UUID')
  if (!isUuid(member_id)) return bad('member_id must be a UUID')
  if (typeof slot_id !== 'string' || slot_id.trim() === '' || slot_id.length > MAX_SLOT_ID)
    return bad('slot_id is required')

  const { data, error } = await supabaseAdmin().rpc('confirm_opportunity_slot', {
    p_opportunity_id: opportunity_id,
    p_slot_id: slot_id.trim(),
    p_member_id: member_id,
  })
  // Generic message on purpose: a database error should not reach the caller.
  if (error) return Response.json({ error: 'Could not confirm the slot' }, { status: 500 })

  const result = (data ?? {}) as Outcome
  switch (result.outcome) {
    case 'confirmed':
      return Response.json({ visit_id: result.visit_id })
    case 'already_covered':
      return Response.json({ error: 'Someone else already covered this', covered_by: result.covered_by ?? null }, { status: 409 })
    case 'not_open':
      return Response.json({ error: 'This idea is no longer open' }, { status: 410 })
    case 'slot_not_found':
      return bad('slot_id is not one of the proposed slots')
    case 'not_family':
      return Response.json({ error: 'This member is not part of that family' }, { status: 403 })
    case 'not_found':
      return Response.json({ error: 'Opportunity not found' }, { status: 404 })
    default:
      return Response.json({ error: 'Could not confirm the slot' }, { status: 500 })
  }
}
