import { describe, expect, it, vi } from 'vitest'
import { startVapiCall, type StartCallInput } from '@/lib/vapi/start-call'

const input: StartCallInput = {
  apiKey: 'private-key',
  assistantId: 'assistant-1',
  phoneNumberId: 'number-1',
  customer: { number: '+14155550142', name: 'Jane' },
  variables: {
    senior_name: 'Jane',
    today: 'Sunday, October 18',
    family_summary: 'Sarah (daughter)',
    last_topics: 'none',
    open_thread: 'none',
  },
}

const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('startVapiCall', () => {
  it('asks Vapi to phone the senior with their variables', async () => {
    const fetchImpl = reply(201, { id: 'call-1', status: 'queued' })

    await expect(startVapiCall(input, fetchImpl)).resolves.toEqual({ id: 'call-1' })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.vapi.ai/call')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer private-key')
    expect(JSON.parse(init?.body as string)).toEqual({
      assistantId: 'assistant-1',
      phoneNumberId: 'number-1',
      customer: { number: '+14155550142', name: 'Jane' },
      assistantOverrides: { variableValues: input.variables },
    })
  })

  it("explains Vapi's refusal", async () => {
    const fetchImpl = reply(400, { message: ['customer.number must be a valid phone number'] })
    await expect(startVapiCall(input, fetchImpl)).rejects.toThrow(
      'Vapi refused the call (HTTP 400): customer.number must be a valid phone number',
    )
  })

  it('fails when Vapi returns no call id', async () => {
    await expect(startVapiCall(input, reply(201, {}))).rejects.toThrow('Vapi did not return a call id')
  })
})
