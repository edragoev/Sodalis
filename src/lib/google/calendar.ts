export type BusyWindow = { start: string; end: string }

async function getAccessToken(refreshToken: string, fetchFn: typeof fetch): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Google OAuth env vars are not configured')

  const response = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Could not refresh Google access token: ${text || response.statusText}`)
  }

  const json = (await response.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('No access token from Google refresh response')
  return json.access_token
}

export async function refreshGoogleAccessToken(refreshToken: string, fetchFn: typeof fetch = fetch) {
  return getAccessToken(refreshToken, fetchFn)
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
  const token = await refreshGoogleAccessToken(refreshToken, fetchFn)
  const response = await fetchFn('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items: [{ id: 'primary' }],
      timeMin,
      timeMax,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Could not load Google busy windows: ${text || response.statusText}`)
  }

  const json = (await response.json()) as {
    calendars?: {
      primary?: {
        busy?: Array<{ start?: string; end?: string }>
      }
    }
  }

  return (json.calendars?.primary?.busy ?? []).flatMap((slot) => {
    if (!slot.start || !slot.end) return []
    return [{ start: slot.start, end: slot.end }]
  })
}
