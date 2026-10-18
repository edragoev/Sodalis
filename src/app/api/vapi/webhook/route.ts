import { createVapiWebhook } from '@/lib/vapi/webhook'
import { vapiWebhookDeps } from '@/lib/vapi/webhook-deps'

// Vapi server messages. Only `end-of-call-report` is handled; see src/lib/vapi/webhook.ts.
// Three Gemini steps run one after another, each up to two 30 s attempts.
export const maxDuration = 300

export function POST(request: Request) {
  return createVapiWebhook(vapiWebhookDeps())(request)
}
