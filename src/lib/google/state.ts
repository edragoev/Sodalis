import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// The OAuth `state` parameter: a signed {member, nonce, expiry}. The nonce is also set as an
// httpOnly cookie, so a callback only works in the browser that started the flow (CSRF guard).

export const STATE_COOKIE = 'google_oauth_nonce'
const MAX_AGE_S = 600

function sign(payload: string): string {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) throw new Error('ENCRYPTION_KEY is not set')
  return createHmac('sha256', secret).update(`google-oauth-state:${payload}`).digest('base64url')
}

export function createState(memberId: string, now = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ m: memberId, n: nonce, e: now + MAX_AGE_S * 1000 }),
  ).toString('base64url')
  return { state: `${payload}.${sign(payload)}`, nonce }
}

/** The member id when `state` is untampered, unexpired and matches the cookie nonce; else null. */
export function verifyState(
  state: string | null,
  cookieNonce: string | undefined,
  now = Date.now(),
): string | null {
  if (!state || !cookieNonce) return null
  const [payload, sig, ...rest] = state.split('.')
  if (!payload || !sig || rest.length) return null

  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const { m, n, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof m !== 'string' || typeof n !== 'string' || typeof e !== 'number') return null
    if (e < now || n !== cookieNonce) return null
    return m
  } catch {
    return null
  }
}

export function nonceCookie(nonce: string, secure: boolean): string {
  return `${STATE_COOKIE}=${nonce}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure ? '; Secure' : ''}`
}

export function clearNonceCookie(secure: boolean): string {
  return `${STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}

export function readNonce(request: Request): string | undefined {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === STATE_COOKIE) return value.join('=')
  }
  return undefined
}
