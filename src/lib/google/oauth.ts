export const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

export async function exchangeCode(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env vars are not configured')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Google token exchange failed: ${text || response.statusText}`)
  }

  const json = (await response.json()) as { refresh_token?: string; scope?: string; access_token?: string }
  return {
    refreshToken: json.refresh_token ?? '',
    scope: json.scope ?? '',
    accessToken: json.access_token ?? '',
  }
}
