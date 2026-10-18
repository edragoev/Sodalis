import { getAdminMessaging } from '@/lib/firebase/admin'
import { checkToken } from '@/lib/firebase/verify-token'
import { bad, isUuid, readJsonObject } from '@/lib/http'
import { supabaseAdmin } from '@/lib/supabase/server'

// Checks, without sending anything, that a member's stored push token is still accepted by Firebase.
// A dead token is cleared so the browser can register a fresh one. The token is never returned.
export async function POST(request: Request) {
  const body = await readJsonObject(request)
  if (body instanceof Response) return body

  const { member_id } = body
  if (!isUuid(member_id)) return bad('member_id must be a UUID')

  const db = supabaseAdmin()
  const { data: member, error } = await db
    .from('family_members')
    .select('fcm_token')
    .eq('id', member_id)
    .maybeSingle()

  if (error) return Response.json({ error: 'Could not look up the member' }, { status: 500 })
  if (!member) return Response.json({ error: 'Member not found' }, { status: 404 })
  if (!member.fcm_token) return Response.json({ error: 'No push token registered' }, { status: 409 })

  try {
    if ((await checkToken(getAdminMessaging(), member.fcm_token)) === 'dead') {
      await db.from('family_members').update({ fcm_token: null }).eq('id', member_id)
      return Response.json({ error: 'The push token is no longer valid; register again' }, { status: 410 })
    }
  } catch (err) {
    console.error('Push token check failed:', err instanceof Error ? err.name : 'unknown error')
    return Response.json({ error: 'Could not check the push token' }, { status: 502 })
  }
  return Response.json({ ok: true })
}
