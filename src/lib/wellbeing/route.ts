import { bad, isUuid, readJsonObject } from '@/lib/http'
import { secretMatches } from '@/lib/shared-secret'
import type { WellbeingResult } from './plan'

// POST /api/agent/wellbeing: runs the wellbeing agent for one saved check-in. Internal, so it takes the same
// shared secret as the Vapi webhook.

export interface WellbeingRouteDeps {
  secret?: string
  plan(checkInId: string, options: { force?: boolean }): Promise<WellbeingResult>
}

export function createWellbeingRoute({ secret, plan }: WellbeingRouteDeps) {
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
      console.error('wellbeing: the run failed', (err as Error).message)
      return Response.json({ error: 'Could not check wellbeing' }, { status: 500 })
    }
  }
}
