function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Google OAuth env vars are not set')
  return { clientId, clientSecret, redirectUri }
}

export type BusyWindow = { start: string; end: string }

export async function refreshGoogleAccessToken(
  refreshToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const { clientId, clientSecret } = config()

  const res = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) throw new Error(`Google token refresh failed (${res.status})`)

  const json = await res.json()
  if (typeof json.access_token !== 'string' || !json.access_token) {
    throw new Error('Google token refresh returned no access token')
  }

  return json.access_token
}

export async function fetchBusyWindows({
  refreshToken,
  timeMin,
  timeMax,
  fetchFn = fetch,
}: {
  refreshToken: string
  timeMin: string
  timeMax: string
  fetchFn?: typeof fetch
}): Promise<BusyWindow[]> {
  const accessToken = await refreshGoogleAccessToken(refreshToken, fetchFn)

  const res = await fetchFn('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ id: 'primary' }],
      timeMin,
      timeMax,
    }),
  })

  if (!res.ok) throw new Error(`Google free/busy request failed (${res.status})`)

  const json = await res.json()
  const busy = Array.isArray(json?.calendars?.primary?.busy) ? json.calendars.primary.busy : []

  return busy.filter(
    (window: unknown): window is BusyWindow =>
      typeof window === 'object' &&
      window !== null &&
      typeof (window as { start?: string }).start === 'string' &&
      typeof (window as { end?: string }).end === 'string',
  )
}
