import { createWellbeingRoute } from '@/lib/wellbeing/route'
import { planWellbeing } from '@/lib/wellbeing/deps'

// Runs the wellbeing agent for one saved check-in. Internal: callers send the shared secret in x-vapi-secret.
export const maxDuration = 90

export function POST(request: Request) {
  return createWellbeingRoute({ secret: process.env.VAPI_WEBHOOK_SECRET, plan: planWellbeing })(request)
}
