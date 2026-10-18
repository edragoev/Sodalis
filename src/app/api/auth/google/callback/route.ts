import { encryptToken } from '@/lib/google/crypto'
import { fetchBusyWindows } from '@/lib/google/calendar'
import { exchangeCode, SCOPE } from '@/lib/google/oauth'
import { clearNonceCookie, readNonce, verifyState } from '@/lib/google/state'
import { supabaseAdmin } from '@/lib/supabase/server'

// The Calendar tab, which shows "Google Calendar connected" (or what went wrong) from ?calendar=.
const DONE_PATH = '/schedule'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secure = url.protocol === 'https:'

  const back = (result: string) =>
    new Response(null, {
      status: 302,
      headers: {
        location: new URL(`${DONE_PATH}?calendar=${result}`, url.origin).href,
        'set-cookie': clearNonceCookie(secure),
      },
    })

  if (url.searchParams.get('error')) return back('denied')

  const memberId = verifyState(url.searchParams.get('state'), readNonce(request))
  const code = url.searchParams.get('code')
  if (!memberId || !code) return back('error')

  let tokens
  try {
    tokens = await exchangeCode(code)
  } catch {
    return back('error')
  }

  if (!tokens.refreshToken || !tokens.scope.split(' ').includes(SCOPE)) return back('error')

  try {
    const now = Date.now()
    await fetchBusyWindows({
      refreshToken: tokens.refreshToken,
      timeMin: new Date(now).toISOString(),
      timeMax: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
  } catch {
    return back('error')
  }

  const { data, error } = await supabaseAdmin()
    .from('family_members')
    .update({ google_refresh_token: encryptToken(tokens.refreshToken), calendar_connected: true })
    .eq('id', memberId)
    .select('id')

  if (error || !data || data.length === 0) return back('error')
  return back('connected')
}
