import { planEvents } from '@/lib/event-planner/deps'
import { createPlanEventsRoute } from '@/lib/event-planner/route'

// Runs the event planner for one saved check-in. Internal: callers send the shared secret in x-vapi-secret.
export const maxDuration = 90

export function POST(request: Request) {
  return createPlanEventsRoute({ secret: process.env.VAPI_WEBHOOK_SECRET, plan: planEvents })(request)
}
