import { describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'
import { createCoordinateRoute } from '@/lib/coordinator/route'

// POST /api/agent/coordinate runs the coordinator for one opportunity (specs/02-api/routes.md).
// It is internal, so it needs the same shared secret as the Vapi webhook.

const SECRET = 'shh-its-a-secret'
const ID = '3f2b8c1e-6a4d-4e0b-9c55-1d2e3f4a5b6c'

function setup(result: unknown = { status: 'proposed', usedFallback: false, pushed: true }, over: { secret?: string } = {}) {
  const coordinate = vi.fn().mockResolvedValue(result)
  const handler = createCoordinateRoute({ secret: 'secret' in over ? over.secret : SECRET, coordinate })
  const post = (body: unknown, headers: Record<string, string> = { 'x-vapi-secret': SECRET }) =>
    callRoute(handler, '/api/agent/coordinate', { body, headers })
  return { coordinate, post }
}

describe('POST /api/agent/coordinate', () => {
  it('runs the coordinator for the opportunity and returns its result', async () => {
    const { coordinate, post } = setup()

    const res = await post({ opportunity_id: ID })

    expect(res.status).toBe(200)
    expect(coordinate).toHaveBeenCalledWith(ID)
    expect(res.json).toEqual({ status: 'proposed', usedFallback: false, pushed: true })
  })

  it.each([
    ['no header', {}],
    ['an empty header', { 'x-vapi-secret': '' }],
    ['the wrong secret', { 'x-vapi-secret': 'nope' }],
  ])('rejects %s without running anything', async (_name, headers) => {
    const { coordinate, post } = setup()
    expect((await post({ opportunity_id: ID }, headers)).status).toBe(401)
    expect(coordinate).not.toHaveBeenCalled()
  })

  it.each([undefined, ''])('rejects everything when no secret is configured (%j)', async (secret) => {
    const { coordinate, post } = setup(undefined, { secret })
    expect((await post({ opportunity_id: ID }, { 'x-vapi-secret': '' })).status).toBe(401)
    expect(coordinate).not.toHaveBeenCalled()
  })

  it.each([
    ['no body', undefined],
    ['no opportunity_id', {}],
    ['an id that is not a UUID', { opportunity_id: 'opp-1' }],
    ['a number', { opportunity_id: 7 }],
  ])('returns 400 for %s', async (_name, body) => {
    const { coordinate, post } = setup()
    expect((await post(body)).status).toBe(400)
    expect(coordinate).not.toHaveBeenCalled()
  })

  it('returns 404 when the opportunity does not exist', async () => {
    const { post } = setup({ status: 'not_found' })
    expect((await post({ opportunity_id: ID })).status).toBe(404)
  })

  it.each(['skipped', 'no_slots'])('answers 200 with %s, which is not an error', async (status) => {
    const { post } = setup({ status })
    const res = await post({ opportunity_id: ID })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ status })
  })

  it('returns 500 without leaking why when the coordinator throws', async () => {
    const coordinate = vi.fn().mockRejectedValue(new Error('connection refused to 10.0.0.5'))
    const handler = createCoordinateRoute({ secret: SECRET, coordinate })
    const res = await callRoute(handler, '/api/agent/coordinate', { body: { opportunity_id: ID }, headers: { 'x-vapi-secret': SECRET } })
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.json)).not.toContain('10.0.0.5')
  })
})
