// The browser's call to POST /api/push/register, which stores a member's FCM token.

export async function registerToken(
  memberId: string,
  token: string,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<{ ok: boolean }> {
  try {
    const res = await fetchFn('/api/push/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, token }),
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

export type TokenCheck = 'valid' | 'dead' | 'unknown'

/**
 * Asks POST /api/push/verify whether the stored token is still accepted by Firebase.
 * 'unknown' means we could not tell (network or server trouble), which is not the same as dead.
 */
export async function verifyToken(
  memberId: string,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<TokenCheck> {
  try {
    const res = await fetchFn('/api/push/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member_id: memberId }),
    })
    if (res.ok) return 'valid'
    return res.status === 410 ? 'dead' : 'unknown'
  } catch {
    return 'unknown'
  }
}
