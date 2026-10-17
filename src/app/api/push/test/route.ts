import { getAdminMessaging } from '@/lib/firebase/admin'
import { isDeadTokenError, sendTestPush } from '@/lib/firebase/test-push'
import { bad, isUuid } from '@/lib/http'
import { supabaseAdmin } from '@/lib/supabase/server'

// Sends a hello-world push to one member, to prove their registered token works.
// The token is a credential, so it is never returned and never appears in an error.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return bad('Request body must be valid JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return bad('Request body must be a JSON object')

  const { member_id } = body as Record<string, unknown>
  if (!isUuid(member_id)) return bad('member_id must be a UUID')

  const db = supabaseAdmin()
  const { data: member, error } = await db
    .from('family_members')
    .select('name, fcm_token')
    .eq('id', member_id)
    .maybeSingle()

  if (error) return Response.json({ error: 'Could not look up the member' }, { status: 500 })
  if (!member) return Response.json({ error: 'Member not found' }, { status: 404 })
  if (!member.fcm_token)
    return Response.json({ error: 'This member has no push token registered yet' }, { status: 409 })

  try {
    await sendTestPush(getAdminMessaging(), member.fcm_token, member.name)
  } catch (err) {
    if (isDeadTokenError(err)) {
      // Firebase says this token will never work again, so stop keeping it.
      await db.from('family_members').update({ fcm_token: null }).eq('id', member_id)
      return Response.json({ error: 'The push token is no longer valid; register again' }, { status: 410 })
    }
    return Response.json({ error: 'Could not send the push notification' }, { status: 502 })
  }
  return Response.json({ ok: true })
}
