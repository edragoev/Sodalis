import { bad, isUuid } from '@/lib/http'
import { consentUrl } from '@/lib/google/oauth'
import { createState, nonceCookie } from '@/lib/google/state'
import { supabaseAdmin } from '@/lib/supabase/server'

// Starts a member's Google Calendar connection: redirects to Google's consent screen.
export async function GET(request: Request) {
  const memberId = new URL(request.url).searchParams.get('member_id')
  if (!isUuid(memberId)) return bad('member_id must be a UUID')

  const { data, error } = await supabaseAdmin()
    .from('family_members')
    .select('id')
    .eq('id', memberId)
    .maybeSingle()
  if (error) return Response.json({ error: 'Could not start Google sign-in' }, { status: 500 })
  if (!data) return Response.json({ error: 'Member not found' }, { status: 404 })

  const { state, nonce } = createState(memberId)
  const secure = new URL(request.url).protocol === 'https:'
  return new Response(null, {
    status: 302,
    headers: { location: consentUrl(state), 'set-cookie': nonceCookie(nonce, secure) },
  })
}
