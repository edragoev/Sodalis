import { describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'
import { createVapiWebhook, type VapiWebhookDeps } from '@/lib/vapi/webhook'

// POST /api/vapi/webhook, `end-of-call-report` (specs/02-api/routes.md "Webhook flow").
// The handler only orchestrates; every collaborator is injected, so these tests need no database.
// Not here yet: Gemini analysis (mood, topics, flags), alerts and call requests.

const SECRET = 'shh-its-a-secret'
const SENIOR = { id: 'senior-1' }

const report = (over: Record<string, unknown> = {}, callOver: Record<string, unknown> = {}) => ({
  message: {
    type: 'end-of-call-report',
    endedReason: 'customer-ended-call',
    startedAt: '2026-10-15T14:00:00.000Z',
    endedAt: '2026-10-15T14:05:30.000Z',
    summary: 'Talked about the garden.',
    artifact: { transcript: "AI: Hello!\nUser: My zucchini are out of control." },
    call: { id: 'call-1', customer: { number: '+15550100001' }, ...callOver },
    ...over,
  },
})

function setup(over: Partial<VapiWebhookDeps> = {}) {
  const tasks: (() => Promise<void>)[] = []
  const deps = {
    secret: SECRET,
    findSeniorByPhone: vi.fn().mockResolvedValue(SENIOR),
    insertCheckIn: vi.fn().mockResolvedValue({ id: 'ci-1' }),
    linkHopeOpportunities: vi.fn().mockResolvedValue([]),
    propose: vi.fn().mockResolvedValue(undefined),
    after: (task: () => Promise<void>) => void tasks.push(task),
    now: () => new Date('2026-10-15T15:00:00.000Z'),
    ...over,
  } satisfies VapiWebhookDeps
  const handler = createVapiWebhook(deps)
  const post = (body: unknown, headers: Record<string, string> = { 'x-vapi-secret': SECRET }) =>
    callRoute(handler, '/api/vapi/webhook', { body, headers })
  const runAfter = async () => {
    for (const task of tasks.splice(0)) await task()
  }
  return { deps, post, runAfter, tasks }
}

const untouched = (deps: ReturnType<typeof setup>['deps']) => {
  expect(deps.findSeniorByPhone).not.toHaveBeenCalled()
  expect(deps.insertCheckIn).not.toHaveBeenCalled()
  expect(deps.linkHopeOpportunities).not.toHaveBeenCalled()
}

describe('POST /api/vapi/webhook', () => {
  describe('alerts raised during the call (flag_concern)', () => {
    it('are linked to the new check-in by the Vapi call id', async () => {
      const linkAlerts = vi.fn().mockResolvedValue(undefined)
      const { post } = setup({ linkAlerts })
      expect((await post(report())).status).toBe(200)
      expect(linkAlerts).toHaveBeenCalledWith('call-1', 'ci-1')
    })

    it('a failed link still saves the call', async () => {
      const linkAlerts = vi.fn().mockRejectedValue(new Error('db down'))
      const { post } = setup({ linkAlerts })
      const res = await post(report())
      expect(res.status).toBe(200)
      expect(res.json).toEqual({ ok: true, check_in_id: 'ci-1' })
    })
  })

  describe('the event planner', () => {
    it('runs after the response for a call with a transcript', async () => {
      const extract = vi.fn().mockResolvedValue(undefined)
      const { post, runAfter } = setup({ extract })
      expect((await post(report())).status).toBe(200)
      expect(extract).not.toHaveBeenCalled()
      await runAfter()
      expect(extract).toHaveBeenCalledWith('ci-1')
    })

    it('is not run for a call nobody answered', async () => {
      const extract = vi.fn()
      const { post, runAfter } = setup({ extract })
      await post(report({ endedReason: 'voicemail' }))
      await runAfter()
      expect(extract).not.toHaveBeenCalled()
    })

    it('never breaks the response or the other proposals when it throws', async () => {
      const extract = vi.fn().mockRejectedValue(new Error('boom'))
      const { post, runAfter, deps } = setup({ extract, linkHopeOpportunities: vi.fn().mockResolvedValue(['opp-1']) })
      expect((await post(report())).status).toBe(200)
      await expect(runAfter()).resolves.toBeUndefined()
      expect(deps.propose).toHaveBeenCalledWith('opp-1')
    })

    it('finishes an unfinished extraction when Vapi redelivers the call', async () => {
      const extract = vi.fn().mockResolvedValue(undefined)
      const { post, runAfter } = setup({
        extract,
        insertCheckIn: vi.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' })),
        pendingExtraction: vi.fn().mockResolvedValue('ci-9'),
      })
      expect((await post(report())).json).toEqual({ ok: true, duplicate: true })
      await runAfter()
      expect(extract).toHaveBeenCalledWith('ci-9')
    })

    it('leaves a finished extraction alone on redelivery', async () => {
      const extract = vi.fn()
      const { post, runAfter } = setup({
        extract,
        insertCheckIn: vi.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' })),
        pendingExtraction: vi.fn().mockResolvedValue(null),
      })
      await post(report())
      await runAfter()
      expect(extract).not.toHaveBeenCalled()
    })
  })

  describe('the wellbeing agent', () => {
    it('runs after the response, even when the event planner fails', async () => {
      const wellbeing = vi.fn().mockResolvedValue(undefined)
      const extract = vi.fn().mockRejectedValue(new Error('boom'))
      const { post, runAfter } = setup({ extract, wellbeing })
      expect((await post(report())).status).toBe(200)
      expect(wellbeing).not.toHaveBeenCalled()
      await runAfter()
      expect(wellbeing).toHaveBeenCalledWith('ci-1')
    })

    it('does not break the webhook when it throws', async () => {
      const wellbeing = vi.fn().mockRejectedValue(new Error('boom'))
      const { post, runAfter } = setup({ wellbeing })
      expect((await post(report())).status).toBe(200)
      await expect(runAfter()).resolves.toBeUndefined()
    })

    it('is skipped for a call without a transcript', async () => {
      const wellbeing = vi.fn()
      const { post, runAfter } = setup({ wellbeing })
      await post(report({ artifact: {} }))
      await runAfter()
      expect(wellbeing).not.toHaveBeenCalled()
    })

    it('finishes an unfinished run when Vapi redelivers the call', async () => {
      const wellbeing = vi.fn().mockResolvedValue(undefined)
      const { post, runAfter } = setup({
        wellbeing,
        insertCheckIn: vi.fn().mockRejectedValue({ code: '23505' }),
        pendingWellbeing: vi.fn().mockResolvedValue('ci-9'),
      })
      expect((await post(report())).json.duplicate).toBe(true)
      await runAfter()
      expect(wellbeing).toHaveBeenCalledWith('ci-9')
    })
  })

  describe('the call summary (mood, topics, summary)', () => {
    it('runs first after the response, then the planner, then wellbeing, one at a time', async () => {
      const order: string[] = []
      const step = (name: string) => vi.fn(async () => void order.push(name))
      const { post, runAfter } = setup({ summarize: step('summary'), extract: step('planner'), wellbeing: step('wellbeing') })
      expect((await post(report())).status).toBe(200)
      expect(order).toEqual([])
      await runAfter()
      expect(order).toEqual(['summary', 'planner', 'wellbeing'])
    })

    it('a failed summary still lets the planner and wellbeing run', async () => {
      const extract = vi.fn().mockResolvedValue(undefined)
      const wellbeing = vi.fn().mockResolvedValue(undefined)
      const { post, runAfter } = setup({ summarize: vi.fn().mockRejectedValue(new Error('boom')), extract, wellbeing })
      await post(report())
      await expect(runAfter()).resolves.toBeUndefined()
      expect(extract).toHaveBeenCalledWith('ci-1')
      expect(wellbeing).toHaveBeenCalledWith('ci-1')
    })

    it('is skipped for a call without a transcript', async () => {
      const summarize = vi.fn()
      const { post, runAfter } = setup({ summarize })
      await post(report({ artifact: {} }))
      await runAfter()
      expect(summarize).not.toHaveBeenCalled()
    })

    it('is skipped for a call nobody answered', async () => {
      const summarize = vi.fn()
      const { post, runAfter } = setup({ summarize })
      await post(report({ endedReason: 'customer-did-not-answer' }))
      await runAfter()
      expect(summarize).not.toHaveBeenCalled()
    })

    it('summarises a call that never was when Vapi redelivers it', async () => {
      const summarize = vi.fn().mockResolvedValue(undefined)
      const { post, runAfter } = setup({
        summarize,
        insertCheckIn: vi.fn().mockRejectedValue({ code: '23505' }),
        pendingSummary: vi.fn().mockResolvedValue('ci-9'),
      })
      expect((await post(report())).json.duplicate).toBe(true)
      await runAfter()
      expect(summarize).toHaveBeenCalledWith('ci-9')
    })
  })

  describe('the shared secret (401 Unauthorized)', () => {
    it('accepts a request carrying the secret in x-vapi-secret', async () => {
      const { post } = setup()
      expect((await post(report())).status).toBe(200)
    })

    it.each([
      ['no header', {}],
      ['an empty header', { 'x-vapi-secret': '' }],
      ['the wrong secret', { 'x-vapi-secret': 'nope' }],
      ['a secret that is only a prefix of the real one', { 'x-vapi-secret': SECRET.slice(0, 5) }],
    ])('rejects %s, and touches nothing', async (_name, headers) => {
      const { deps, post } = setup()
      const res = await post(report(), headers)
      expect(res.status).toBe(401)
      untouched(deps)
    })

    it.each([undefined, ''])('rejects everything when no secret is configured (%j), even an empty header', async (secret) => {
      const { deps, post } = setup({ secret })
      expect((await post(report(), { 'x-vapi-secret': '' })).status).toBe(401)
      expect((await post(report(), { 'x-vapi-secret': 'anything' })).status).toBe(401)
      untouched(deps)
    })

    it('never echoes the secret back', async () => {
      const { post } = setup()
      expect(JSON.stringify((await post(report(), { 'x-vapi-secret': 'nope' })).json)).not.toContain(SECRET)
    })
  })

  describe('requests it should ignore or refuse', () => {
    it.each(['status-update', 'transcript', 'tool-calls', 'speech-update', 'hang'])(
      'answers 200 and does nothing for a %s message',
      async (type) => {
        const { deps, post } = setup()
        const res = await post({ message: { type } })
        expect(res.status).toBe(200)
        expect(res.json).toMatchObject({ ignored: true })
        untouched(deps)
      },
    )

    it('returns 400 for a body that is not JSON', async () => {
      const { deps, post } = setup()
      const res = await post(undefined)
      expect(res.status).toBe(400)
      untouched(deps)
    })

    it.each([
      ['there is no message', {}],
      ['the call has no id', report({}, { id: undefined })],
      ['the call has no customer number', report({}, { customer: {} })],
    ])('returns 400 when %s, without inserting anything', async (_name, body) => {
      const { deps, post } = setup()
      const res = await post(body)
      expect(res.status).toBe(400)
      expect(deps.insertCheckIn).not.toHaveBeenCalled()
    })

    it('answers 200, and stores nothing, for a number that belongs to no senior (Vapi must not retry)', async () => {
      const { deps, post } = setup({ findSeniorByPhone: vi.fn().mockResolvedValue(null) })
      const res = await post(report())
      expect(res.status).toBe(200)
      expect(res.json).toMatchObject({ ignored: true })
      expect(deps.insertCheckIn).not.toHaveBeenCalled()
    })

    it('looks the senior up by the number that was called', async () => {
      const { deps, post } = setup()
      await post(report())
      expect(deps.findSeniorByPhone).toHaveBeenCalledWith('+15550100001')
    })
  })

  describe('web calls (the Talk button) have no phone number', () => {
    const DEMO = '+15550100142'
    const webCall = report({}, { type: 'webCall', customer: undefined })

    it('saves a web call for the demo senior when DEMO_SENIOR_PHONE is set', async () => {
      const { deps, post } = setup({ demoSeniorPhone: DEMO })
      const res = await post(webCall)
      expect(res.status).toBe(200)
      expect(deps.findSeniorByPhone).toHaveBeenCalledWith(DEMO)
      expect(deps.insertCheckIn).toHaveBeenCalledOnce()
    })

    it.each([undefined, ''])('returns 400 for a web call when no demo senior is configured (%j)', async (demoSeniorPhone) => {
      const { deps, post } = setup({ demoSeniorPhone })
      expect((await post(webCall)).status).toBe(400)
      expect(deps.insertCheckIn).not.toHaveBeenCalled()
    })

    it('never files a phone call without a number under the demo senior', async () => {
      const { deps, post } = setup({ demoSeniorPhone: DEMO })
      const res = await post(report({}, { type: 'outboundPhoneCall', customer: {} }))
      expect(res.status).toBe(400)
      expect(deps.findSeniorByPhone).not.toHaveBeenCalled()
    })

    it('uses the real number when a web call does carry one', async () => {
      const { deps, post } = setup({ demoSeniorPhone: DEMO })
      await post(report({}, { type: 'webCall' }))
      expect(deps.findSeniorByPhone).toHaveBeenCalledWith('+15550100001')
    })
  })

  describe('storing the check-in', () => {
    it('saves the call for that senior, with its transcript, summary and duration', async () => {
      const { deps, post } = setup()

      const res = await post(report())

      expect(res.status).toBe(200)
      expect(res.json).toEqual({ ok: true, check_in_id: 'ci-1' })
      expect(deps.insertCheckIn).toHaveBeenCalledTimes(1)
      expect(deps.insertCheckIn).toHaveBeenCalledWith({
        senior_id: 'senior-1',
        vapi_call_id: 'call-1',
        started_at: '2026-10-15T14:00:00.000Z',
        ended_at: '2026-10-15T14:05:30.000Z',
        duration_s: 330,
        status: 'completed',
        transcript: 'AI: Hello!\nUser: My zucchini are out of control.',
        summary: 'Talked about the garden.',
      })
    })

    it('copes with a call that carries no transcript or summary', async () => {
      const { deps, post } = setup()
      await post(report({ artifact: undefined, summary: undefined }))
      const saved = deps.insertCheckIn.mock.calls[0][0]
      expect(saved.status).toBe('completed')
      expect(saved).not.toHaveProperty('transcript')
      expect(saved).not.toHaveProperty('summary')
    })

    it('falls back to the current time when Vapi sends no start time, and skips a duration it cannot compute', async () => {
      const { deps, post } = setup()
      await post(report({ startedAt: undefined, endedAt: undefined }))
      const saved = deps.insertCheckIn.mock.calls[0][0]
      expect(saved.started_at).toBe('2026-10-15T15:00:00.000Z')
      expect(saved).not.toHaveProperty('duration_s')
    })

    it('never stores a negative duration if the times arrive out of order', async () => {
      const { deps, post } = setup()
      await post(report({ startedAt: '2026-10-15T14:05:30.000Z', endedAt: '2026-10-15T14:00:00.000Z' }))
      expect(deps.insertCheckIn.mock.calls[0][0]).not.toHaveProperty('duration_s')
    })

    it.each(['customer-did-not-answer', 'voicemail', 'customer-busy'])(
      'records %s as no_answer and stops: no transcript, no linking, no proposals',
      async (endedReason) => {
        const { deps, post, tasks } = setup()

        const res = await post(report({ endedReason }))

        expect(res.status).toBe(200)
        expect(deps.insertCheckIn).toHaveBeenCalledWith(
          expect.objectContaining({ vapi_call_id: 'call-1', status: 'no_answer' }),
        )
        expect(deps.insertCheckIn.mock.calls[0][0]).not.toHaveProperty('transcript')
        expect(deps.linkHopeOpportunities).not.toHaveBeenCalled()
        expect(tasks).toHaveLength(0)
      },
    )

    it.each(['assistant-error', 'pipeline-error-openai-llm-failed'])(
      'records %s as failed, so the call is never lost',
      async (endedReason) => {
        const { deps, post, tasks } = setup()
        await post(report({ endedReason }))
        expect(deps.insertCheckIn).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
        expect(tasks).toHaveLength(0)
      },
    )

    it('answers 200 for a call it has already stored (Vapi retries), and does nothing more', async () => {
      const { deps, post, tasks } = setup({
        insertCheckIn: vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' })),
      })

      const res = await post(report())

      expect(res.status).toBe(200)
      expect(res.json).toMatchObject({ duplicate: true })
      expect(deps.linkHopeOpportunities).not.toHaveBeenCalled()
      expect(tasks).toHaveLength(0)
    })

    it('answers 500, so Vapi retries, when the check-in cannot be saved; without leaking why', async () => {
      const { post } = setup({
        insertCheckIn: vi.fn().mockRejectedValue(Object.assign(new Error('connection refused to 10.0.0.5'), { code: '08006' })),
      })

      const res = await post(report())

      expect(res.status).toBe(500)
      expect(JSON.stringify(res.json)).not.toContain('10.0.0.5')
    })
  })

  describe('opportunities Hope started during the call', () => {
    it('links them to the new check-in, once', async () => {
      const { deps, post } = setup()
      await post(report())
      expect(deps.linkHopeOpportunities).toHaveBeenCalledTimes(1)
      expect(deps.linkHopeOpportunities).toHaveBeenCalledWith('call-1', 'ci-1')
    })

    it('proposes each one to the family after the response is sent, not before', async () => {
      const { deps, post, runAfter, tasks } = setup({
        linkHopeOpportunities: vi.fn().mockResolvedValue(['opp-1', 'opp-2']),
      })

      const res = await post(report())

      expect(res.status).toBe(200)
      expect(tasks).toHaveLength(1)
      expect(deps.propose).not.toHaveBeenCalled() // the webhook answers fast; proposing happens after

      await runAfter()
      expect(deps.propose.mock.calls.map((c) => c[0])).toEqual(['opp-1', 'opp-2'])
    })

    it('schedules nothing when there is nothing to propose', async () => {
      const { post, tasks } = setup()
      await post(report())
      expect(tasks).toHaveLength(0)
    })

    it('keeps going when one proposal fails, and never throws out of the background task', async () => {
      const propose = vi.fn().mockRejectedValueOnce(new Error('gemini down')).mockResolvedValue(undefined)
      const { post, runAfter } = setup({
        linkHopeOpportunities: vi.fn().mockResolvedValue(['opp-1', 'opp-2']),
        propose,
      })
      await post(report())

      await expect(runAfter()).resolves.toBeUndefined()

      expect(propose.mock.calls.map((c) => c[0])).toEqual(['opp-1', 'opp-2'])
    })

    it('still saves the call, and answers 200, if linking fails (the transcript must not be lost)', async () => {
      const { deps, post, tasks } = setup({
        linkHopeOpportunities: vi.fn().mockRejectedValue(new Error('db hiccup')),
      })

      const res = await post(report())

      expect(res.status).toBe(200)
      expect(deps.insertCheckIn).toHaveBeenCalledTimes(1)
      expect(tasks).toHaveLength(0)
    })
  })
})
