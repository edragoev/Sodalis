import { createVapiWebhook } from '@/lib/vapi/webhook'
import { vapiWebhookDeps } from '@/lib/vapi/webhook-deps'

// Vapi server messages. Only `end-of-call-report` is handled; see src/lib/vapi/webhook.ts.
export const maxDuration = 30

export function POST(request: Request) {
  return createVapiWebhook(vapiWebhookDeps())(request)
}
