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
