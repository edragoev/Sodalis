// Google OAuth 2.0 (authorization-code flow) over plain fetch. Free/busy only: the app never
// reads event details.

export const SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy'

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Google OAuth env vars are not set')
  return { clientId, clientSecret, redirectUri }
}

export function consentUrl(state: string): string {
  const { clientId, redirectUri } = config()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    // offline + consent make Google issue a refresh token, even on a repeat connect.
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export type TokenResult = { refreshToken: string | null; scope: string }

/** Swaps the one-time code for tokens. Throws when Google rejects it. */
export async function exchangeCode(code: string, fetchFn: typeof fetch = fetch): Promise<TokenResult> {
  const { clientId, clientSecret, redirectUri } = config()
  const res = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`)
  const json = await res.json()
  return {
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    scope: typeof json.scope === 'string' ? json.scope : '',
  }
}
