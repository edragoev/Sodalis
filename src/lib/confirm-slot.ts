// The browser's call to POST /api/schedule/confirm. First accept wins.
// Contract: 200 { visit_id }, 409 { error, covered_by }, anything else is a plain failure.

export type ConfirmParams = { opportunity_id: string; slot_id: string; member_id: string }

export type ConfirmResult =
  | { ok: true; visitId: string }
  | { ok: false; reason: 'already_covered'; coveredBy: string | null }
  | { ok: false; reason: 'error' }

const failed = (): ConfirmResult => ({ ok: false, reason: 'error' })

export async function confirmSlot(
  params: ConfirmParams,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<ConfirmResult> {
  try {
    const res = await fetchFn('/api/schedule/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => null)) as { visit_id?: unknown; covered_by?: unknown } | null

    if (res.status === 409) {
      return {
        ok: false,
        reason: 'already_covered',
        coveredBy: typeof body?.covered_by === 'string' ? body.covered_by : null,
      }
    }
    if (res.ok && typeof body?.visit_id === 'string') return { ok: true, visitId: body.visit_id }
    return failed()
  } catch {
    return failed()
  }
}
