import { describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'
import { createPlanEventsRoute } from '@/lib/event-planner/route'

// POST /api/agent/plan-events: internal, shared secret, one saved check-in.

const SECRET = 'shh-its-a-secret'
const ID = '3f2b8c1e-6a4d-4e0b-9c55-1d2e3f4a5b6c'

function setup(result: unknown = { status: 'done', ideas: [], dropped: [], proposals: [] }, over: { secret?: string } = { secret: SECRET }) {
  const plan = vi.fn().mockResolvedValue(result)
  const handler = createPlanEventsRoute({ secret: over.secret, plan })
  const post = (body: unknown, headers: Record<string, string> = { 'x-vapi-secret': SECRET }) =>
    callRoute(handler, '/api/agent/plan-events', { body, headers })
  return { plan, post }
}

describe('POST /api/agent/plan-events', () => {
  it('runs the planner and returns its result', async () => {
    const { plan, post } = setup()
    const res = await post({ check_in_id: ID })
    expect(res.status).toBe(200)
    expect(plan).toHaveBeenCalledWith(ID, { force: false })
    expect(res.json.status).toBe('done')
  })

  it('passes force through', async () => {
    const { plan, post } = setup()
    await post({ check_in_id: ID, force: true })
    expect(plan).toHaveBeenCalledWith(ID, { force: true })
  })

  it.each([{}, { 'x-vapi-secret': '' }, { 'x-vapi-secret': 'nope' }])('rejects bad credentials %j', async (headers) => {
    const { plan, post } = setup()
    expect((await post({ check_in_id: ID }, headers)).status).toBe(401)
    expect(plan).not.toHaveBeenCalled()
  })

  it('refuses everyone when no secret is configured', async () => {
    const { plan, post } = setup(undefined, {})
    expect((await post({ check_in_id: ID })).status).toBe(401)
    expect(plan).not.toHaveBeenCalled()
  })

  it.each([{}, { check_in_id: 'abc' }, { check_in_id: ID, force: 'yes' }])('rejects a bad body %j', async (body) => {
    const { plan, post } = setup()
    expect((await post(body)).status).toBe(400)
    expect(plan).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown check-in and 500 when the run throws', async () => {
    expect((await setup({ status: 'not_found' }).post({ check_in_id: ID })).status).toBe(404)
    const { plan, post } = setup()
    plan.mockRejectedValue(new Error('db password is hunter2'))
    const res = await post({ check_in_id: ID })
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.json)).not.toContain('hunter2')
  })
})
