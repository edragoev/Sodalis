import { describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'
import { createWellbeingRoute } from '@/lib/wellbeing/route'

const SECRET = 'shh-its-a-secret'
const ID = '3f2b8c1e-6a4d-4e0b-9c55-1d2e3f4a5b6c'

function setup(result: unknown = { status: 'done', alerts: [], dropped: [], notified: null }, over: { secret?: string } = { secret: SECRET }) {
  const plan = vi.fn().mockResolvedValue(result)
  const handler = createWellbeingRoute({ secret: over.secret, plan })
  const post = (body: unknown, headers: Record<string, string> = { 'x-vapi-secret': SECRET }) => callRoute(handler, '/api/agent/wellbeing', { body, headers })
  return { plan, post }
}

describe('POST /api/agent/wellbeing', () => {
  it('runs the agent and passes force through', async () => {
    const { plan, post } = setup()
    expect((await post({ check_in_id: ID })).status).toBe(200)
    expect(plan).toHaveBeenCalledWith(ID, { force: false })
    await post({ check_in_id: ID, force: true })
    expect(plan).toHaveBeenLastCalledWith(ID, { force: true })
  })

  it.each([{}, { 'x-vapi-secret': 'nope' }])('rejects bad credentials %j', async (headers) => {
    const { plan, post } = setup()
    expect((await post({ check_in_id: ID }, headers)).status).toBe(401)
    expect(plan).not.toHaveBeenCalled()
  })

  it('refuses everyone when no secret is configured', async () => {
    const { post } = setup(undefined, {})
    expect((await post({ check_in_id: ID })).status).toBe(401)
  })

  it.each([{}, { check_in_id: 'abc' }, { check_in_id: ID, force: 'yes' }])('rejects a bad body %j', async (body) => {
    expect((await setup().post(body)).status).toBe(400)
  })

  it('returns 404 for an unknown check-in and a generic 500 on error', async () => {
    expect((await setup({ status: 'not_found' }).post({ check_in_id: ID })).status).toBe(404)
    const { plan, post } = setup()
    plan.mockRejectedValue(new Error('password hunter2'))
    const res = await post({ check_in_id: ID })
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.json)).not.toContain('hunter2')
  })
})
