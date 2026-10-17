import { bad, isUuid } from '@/lib/http'
import { supabaseAdmin } from '@/lib/supabase/server'

// Stores a member's FCM token. The token is a credential, so it is never echoed back.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return bad('Request body must be valid JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return bad('Request body must be a JSON object')

  const { member_id, token } = body as Record<string, unknown>
  if (!isUuid(member_id)) return bad('member_id must be a UUID')
  if (typeof token !== 'string' || token.trim() === '') return bad('token is required')

  const { data, error } = await supabaseAdmin()
    .from('family_members')
    .update({ fcm_token: token.trim() })
    .eq('id', member_id)
    .select('id')

  if (error) return Response.json({ error: 'Could not save the token' }, { status: 500 })
  if (!data || data.length === 0) return Response.json({ error: 'Member not found' }, { status: 404 })
  return Response.json({ ok: true })
}
