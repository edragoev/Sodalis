import { bad, isUuid, readJsonObject } from '@/lib/http'
import { secretMatches } from '@/lib/shared-secret'
import type { CoordinatorResult } from './run'

// POST /api/agent/coordinate: runs the coordinator for one opportunity (specs/02-api/routes.md).
// Internal, so it takes the same shared secret as the Vapi webhook.

export interface CoordinateRouteDeps {
  secret?: string
  coordinate(opportunityId: string): Promise<CoordinatorResult>
}

export function createCoordinateRoute({ secret, coordinate }: CoordinateRouteDeps) {
  return async function POST(request: Request): Promise<Response> {
    if (!secretMatches(secret, request.headers.get('x-vapi-secret'))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readJsonObject(request)
    if (body instanceof Response) return body
    if (!isUuid(body.opportunity_id)) return bad('opportunity_id must be a UUID')

    try {
      const result = await coordinate(body.opportunity_id)
      if (result.status === 'not_found') return Response.json({ error: 'Opportunity not found' }, { status: 404 })
      return Response.json(result)
    } catch (err) {
      console.error('coordinate: the run failed', (err as Error).message)
      return Response.json({ error: 'Could not run the coordinator' }, { status: 500 })
    }
  }
}
