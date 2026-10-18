import { encryptToken } from '@/lib/google/crypto'
import { fetchBusyWindows } from '@/lib/google/calendar'
import { exchangeCode, SCOPE } from '@/lib/google/oauth'
import { clearNonceCookie, readNonce, verifyState } from '@/lib/google/state'
import { supabaseAdmin } from '@/lib/supabase/server'

// Google redirects here after consent. Verifies state, swaps the code for a refresh token,
// stores it encrypted, and sends the member back to the app. The token is never echoed.
const DONE_PATH = '/availability'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secure = url.protocol === 'https:'

  // Always leave with the nonce cookie cleared, whatever the outcome.
  const back = (result: string) =>
    new Response(null, {
      status: 302,
      headers: {
        location: new URL(`${DONE_PATH}?calendar=${result}`, url.origin).href,
        'set-cookie': clearNonceCookie(secure),
      },
    })

  // The member said no (or Google reported an error): nothing to store.
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
  // Without the free/busy scope or a refresh token there is nothing usable to keep.
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
