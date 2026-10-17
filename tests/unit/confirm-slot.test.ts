import { describe, expect, it, vi } from 'vitest'
import { confirmSlot } from '@/lib/confirm-slot'

// The browser's call to POST /api/schedule/confirm (specs/02-api/routes.md). First accept wins.
// Contract assumed from the server: 200 { visit_id }, 409 { error, covered_by }, 404, 400.

const params = { opportunity_id: 'opp-1', slot_id: 'slot-a', member_id: 'm1' }

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

describe('confirmSlot', () => {
  it('posts the opportunity, slot and member as JSON to /api/schedule/confirm', async () => {
    const fetchFn = reply(200, { visit_id: 'v1' })

    await confirmSlot(params, fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('/api/schedule/confirm')
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(params)
  })

  it('returns the visit id on success', async () => {
    await expect(confirmSlot(params, reply(200, { visit_id: 'v1' }))).resolves.toEqual({ ok: true, visitId: 'v1' })
  })

  it('reports who got there first when someone else already claimed it (409)', async () => {
    await expect(confirmSlot(params, reply(409, { error: 'Already covered', covered_by: 'Maya' }))).resolves.toEqual({
      ok: false,
      reason: 'already_covered',
      coveredBy: 'Maya',
    })
  })

  it('still reports already_covered when the server does not name the person', async () => {
    await expect(confirmSlot(params, reply(409, { error: 'Already covered' }))).resolves.toEqual({
      ok: false,
      reason: 'already_covered',
      coveredBy: null,
    })
  })

  it.each([400, 404, 410, 500, 502])('reports a plain failure for HTTP %i', async (status) => {
    await expect(confirmSlot(params, reply(status, { error: 'nope' }))).resolves.toEqual({ ok: false, reason: 'error' })
  })

  it('reports a plain failure when the network is down, instead of throwing', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(confirmSlot(params, fetchFn)).resolves.toEqual({ ok: false, reason: 'error' })
  })

  it('reports a plain failure when the reply is not JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 200 }))
    await expect(confirmSlot(params, fetchFn)).resolves.toEqual({ ok: false, reason: 'error' })
  })
})
