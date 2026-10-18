import { bad, isUuid, readJsonObject } from '@/lib/http'
import { secretMatches } from '@/lib/shared-secret'
import type { PlannerResult } from './plan'

// POST /api/agent/plan-events: runs the event planner for one saved check-in and returns the ideas it found,
// who each is for, and the dates. Internal, so it takes the same shared secret as the Vapi webhook.

export interface PlanEventsRouteDeps {
  secret?: string
  plan(checkInId: string, options: { force?: boolean }): Promise<PlannerResult>
}

export function createPlanEventsRoute({ secret, plan }: PlanEventsRouteDeps) {
  return async function POST(request: Request): Promise<Response> {
    if (!secretMatches(secret, request.headers.get('x-vapi-secret'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readJsonObject(request)
    if (body instanceof Response) return body
    if (!isUuid(body.check_in_id)) return bad('check_in_id must be a UUID')
    if (body.force !== undefined && typeof body.force !== 'boolean') return bad('force must be true or false')

    try {
      const result = await plan(body.check_in_id, { force: body.force === true })
      if (result.status === 'not_found') return Response.json({ error: 'Check-in not found' }, { status: 404 })
      return Response.json(result)
    } catch (err) {
      console.error('plan-events: the run failed', (err as Error).message)
      return Response.json({ error: 'Could not plan events' }, { status: 500 })
    }
  }
}
