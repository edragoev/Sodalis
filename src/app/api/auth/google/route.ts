import { createNonce, makeState, setNonceCookie } from '@/lib/google/state'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const memberId = url.searchParams.get('member_id') ?? 'unknown'
  const nonce = createNonce()
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  const clientId = process.env.GOOGLE_CLIENT_ID

  if (!clientId || !redirectUri) {
    return Response.json({ error: 'Google OAuth is not configured' }, { status: 500 })
  }

  const state = makeState(memberId, nonce)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const target = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return new Response(null, {
    status: 302,
    headers: {
      location: target,
      'set-cookie': setNonceCookie(url.protocol === 'https:', nonce),
    },
  })
}
