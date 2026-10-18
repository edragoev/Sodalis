import type { CallVariables } from './call-context'

// Asks Vapi to phone someone with the assistant (POST https://api.vapi.ai/call).
// When the call ends, Vapi sends the end-of-call report to the assistant's Server URL,
// and the webhook finds the senior by customer.number.

export interface StartCallInput {
  apiKey: string
  assistantId: string
  phoneNumberId: string
  customer: { number: string; name: string }
  variables: CallVariables
}

export async function startVapiCall(input: StartCallInput, fetchImpl: typeof fetch = fetch): Promise<{ id: string }> {
  const res = await fetchImpl('https://api.vapi.ai/call', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistantId: input.assistantId,
      phoneNumberId: input.phoneNumberId,
      customer: input.customer,
      assistantOverrides: { variableValues: input.variables },
    }),
  })

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: unknown }
  if (!res.ok) {
    const detail = Array.isArray(body.message) ? body.message.join('; ') : body.message
    throw new Error(`Vapi refused the call (HTTP ${res.status})${detail ? `: ${detail}` : ''}`)
  }
  if (!body.id) throw new Error('Vapi did not return a call id')
  return { id: body.id }
}
