import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const NONCE_COOKIE = 'google_oauth_nonce'
const SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'dev-google-secret'

export function createNonce() {
  return randomBytes(16).toString('hex')
}

export function makeState(memberId: string, nonce: string) {
  const payload = `${memberId}:${nonce}`
  const digest = createHmac('sha256', SECRET).update(payload).digest('hex')
  return `${memberId}:${nonce}:${digest}`
}

export function decodeNonceCookie(req: Request) {
  const cookie = req.headers.get('cookie') ?? ''
  const match = cookie.split(';').find((part) => part.trim().startsWith(`${NONCE_COOKIE}=`))
  return match ? decodeURIComponent(match.trim().slice(`${NONCE_COOKIE}=`.length)) : null
}

export function readNonce(req: Request) {
  return decodeNonceCookie(req)
}

export function verifyState(state: string | null, nonce: string | null) {
  if (!state || !nonce) return null
  const parts = state.split(':')
  if (parts.length !== 3) return null
  const [memberId, stateNonce, digest] = parts
  if (!memberId || !stateNonce || !digest) return null
  if (stateNonce !== nonce) return null

  const expected = createHmac('sha256', SECRET).update(`${memberId}:${stateNonce}`).digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(digest, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return memberId
}

export function clearNonceCookie(secure: boolean) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax']
  if (secure) attrs.push('Secure')
  return `${NONCE_COOKIE}=; ${attrs.join('; ')}; Max-Age=0`
}

export function setNonceCookie(secure: boolean, nonce: string) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax']
  if (secure) attrs.push('Secure')
  return `${NONCE_COOKIE}=${encodeURIComponent(nonce)}; ${attrs.join('; ')}; Max-Age=600`
}
