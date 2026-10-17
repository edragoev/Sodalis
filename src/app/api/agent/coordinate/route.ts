import { coordinateOpportunity } from '@/lib/coordinator/deps'
import { createCoordinateRoute } from '@/lib/coordinator/route'

// Runs the coordinator for one opportunity. Internal: callers send the shared secret in x-vapi-secret.
export const maxDuration = 30

export function POST(request: Request) {
  return createCoordinateRoute({ secret: process.env.VAPI_WEBHOOK_SECRET, coordinate: coordinateOpportunity })(request)
}
