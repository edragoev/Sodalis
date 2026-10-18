import { describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'
import { createVapiTools, type VapiToolsDeps } from '@/lib/vapi/tools'

// POST /api/vapi/tools: Soladis's flag_concern tool (specs/08-agents/hope-tools.md).
// Every collaborator is injected, so these tests need no database or Firebase.

const SECRET = 'shh-its-a-secret'
const JANE = { id: 'senior-1', name: 'Jane', phone_e164: '+14155550142' }

const flag = (args: unknown, id = 'tool-1') => ({ id, type: 'function', function: { name: 'flag_concern', arguments: args } })

const toolCalls = (list: unknown[], callOver: Record<string, unknown> = {}) => ({
  message: {
    type: 'tool-calls',
    toolCallList: list,
    call: { id: 'call-1', type: 'outboundPhoneCall', customer: { number: '+14155550142' }, ...callOver },
  },
})

function setup(over: Partial<VapiToolsDeps> = {}) {
  const tasks: (() => Promise<void>)[] = []
  const deps = {
    secret: SECRET,
    findSeniorByPhone: vi.fn().mockResolvedValue(JANE),
    callHasAlert: vi.fn().mockResolvedValue(false),
    insertAlert: vi.fn().mockResolvedValue({ id: 'alert-1' }),
    pushAlert: vi.fn().mockResolvedValue(undefined),
    after: (task: () => Promise<void>) => void tasks.push(task),
    ...over,
  } satisfies VapiToolsDeps
  const handler = createVapiTools(deps)
  const post = (body: unknown, headers: Record<string, string> = { 'x-vapi-secret': SECRET }) =>
    callRoute(handler, '/api/vapi/tools', { body, headers })
  const runAfter = async () => {
    for (const task of tasks.splice(0)) await task()
  }
  return { deps, post, runAfter, tasks }
}

describe('POST /api/vapi/tools', () => {
  describe('flag_concern', () => {
    it('saves an urgent alert for the senior and answers "ok"', async () => {
      const { deps, post } = setup()

      const res = await post(toolCalls([flag({ type: 'health', detail: "fell, can't get up" })]))

      expect(res.status).toBe(200)
      expect(res.json).toEqual({ results: [{ toolCallId: 'tool-1', result: 'ok' }] })
      expect(deps.findSeniorByPhone).toHaveBeenCalledWith('+14155550142')
      expect(deps.insertAlert).toHaveBeenCalledWith({
        senior_id: 'senior-1',
        type: 'health',
        severity: 'urgent',
        message: "fell, can't get up",
        vapi_call_id: 'call-1',
      })
    })

    it('pushes to the family after answering, so Soladis is not kept waiting', async () => {
      const { deps, post, runAfter } = setup()

      await post(toolCalls([flag({ type: 'health', detail: "fell, can't get up" })]))
      expect(deps.pushAlert).not.toHaveBeenCalled()

      await runAfter()
      expect(deps.pushAlert).toHaveBeenCalledWith(JANE, "fell, can't get up")
    })

    it('keeps safety concerns as safety', async () => {
      const { deps, post } = setup()
      await post(toolCalls([flag({ type: 'safety', detail: 'someone is at the door and she is scared' })]))
      expect(deps.insertAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'safety', severity: 'urgent' }))
    })

    it.each([undefined, 'mild', 'medical'])('treats a missing or unknown type (%j) as health', async (type) => {
      const { deps, post } = setup()
      await post(toolCalls([flag({ type, detail: 'chest pain' })]))
      expect(deps.insertAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'health' }))
    })

    it('is urgent whatever severity Soladis sends', async () => {
      const { deps, post } = setup()
      await post(toolCalls([flag({ type: 'health', detail: 'dizzy', severity: 'mild' })]))
      expect(deps.insertAlert).toHaveBeenCalledWith(expect.objectContaining({ severity: 'urgent' }))
    })

    it('reads arguments sent as a JSON string', async () => {
      const { deps, post } = setup()
      await post(toolCalls([flag(JSON.stringify({ type: 'safety', detail: 'feels unsafe' }))]))
      expect(deps.insertAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'safety', message: 'feels unsafe' }))
    })

    it('still raises the alert when Soladis gives no detail', async () => {
      const { deps, post, runAfter } = setup()
      await post(toolCalls([flag({ type: 'health' })]))
      await runAfter()
      expect(deps.insertAlert).toHaveBeenCalledWith(expect.objectContaining({ message: 'Soladis heard a possible emergency' }))
      expect(deps.pushAlert).toHaveBeenCalledWith(JANE, 'Soladis heard a possible emergency')
    })
  })

  describe('one push per call', () => {
    it('does not push again when the call already raised an alert, but still saves the new one', async () => {
      const { deps, post, runAfter, tasks } = setup({ callHasAlert: vi.fn().mockResolvedValue(true) })

      await post(toolCalls([flag({ type: 'health', detail: 'still on the floor' })]))
      await runAfter()

      expect(deps.callHasAlert).toHaveBeenCalledWith('call-1')
      expect(deps.insertAlert).toHaveBeenCalledTimes(1)
      expect(tasks).toHaveLength(0)
      expect(deps.pushAlert).not.toHaveBeenCalled()
    })

    it('saves every concern in one message but pushes once, with the first', async () => {
      const { deps, post, runAfter } = setup()

      const res = await post(
        toolCalls([flag({ type: 'health', detail: 'fell' }, 'tool-1'), flag({ type: 'safety', detail: 'door open' }, 'tool-2')]),
      )
      await runAfter()

      expect(res.json.results).toEqual([
        { toolCallId: 'tool-1', result: 'ok' },
        { toolCallId: 'tool-2', result: 'ok' },
      ])
      expect(deps.insertAlert).toHaveBeenCalledTimes(2)
      expect(deps.pushAlert).toHaveBeenCalledTimes(1)
      expect(deps.pushAlert).toHaveBeenCalledWith(JANE, 'fell')
    })
  })

  describe('never leaves Soladis without an answer', () => {
    it('answers "ok" and still pushes when the alert cannot be saved', async () => {
      const { deps, post, runAfter } = setup({ insertAlert: vi.fn().mockRejectedValue(new Error('db down')) })

      const res = await post(toolCalls([flag({ type: 'health', detail: 'fell' })]))
      await runAfter()

      expect(res.status).toBe(200)
      expect(res.json.results).toEqual([{ toolCallId: 'tool-1', result: 'ok' }])
      expect(deps.pushAlert).toHaveBeenCalledWith(JANE, 'fell')
    })

    it('answers "ok" when the senior lookup fails', async () => {
      const { deps, post } = setup({ findSeniorByPhone: vi.fn().mockRejectedValue(new Error('db down')) })
      const res = await post(toolCalls([flag({ type: 'health', detail: 'fell' })]))
      expect(res.json.results).toEqual([{ toolCallId: 'tool-1', result: 'ok' }])
      expect(deps.insertAlert).not.toHaveBeenCalled()
    })

    it('answers "ok" and saves nothing for an unknown phone number', async () => {
      const { deps, post, tasks } = setup({ findSeniorByPhone: vi.fn().mockResolvedValue(null) })
      const res = await post(toolCalls([flag({ type: 'health', detail: 'fell' })]))
      expect(res.json.results).toEqual([{ toolCallId: 'tool-1', result: 'ok' }])
      expect(deps.insertAlert).not.toHaveBeenCalled()
      expect(tasks).toHaveLength(0)
    })

    it('a failed push is logged, not thrown', async () => {
      const { post, runAfter } = setup({ pushAlert: vi.fn().mockRejectedValue(new Error('fcm down')) })
      await post(toolCalls([flag({ type: 'health', detail: 'fell' })]))
      await expect(runAfter()).resolves.toBeUndefined()
    })
  })

  describe('web calls (the Talk button) have no phone number', () => {
    it('uses the demo senior for a web call', async () => {
      const { deps, post } = setup({ demoSeniorPhone: '+14155550142' })
      await post(toolCalls([flag({ type: 'health', detail: 'fell' })], { type: 'webCall', customer: undefined }))
      expect(deps.findSeniorByPhone).toHaveBeenCalledWith('+14155550142')
      expect(deps.insertAlert).toHaveBeenCalled()
    })

    it('saves nothing for a web call when DEMO_SENIOR_PHONE is unset, but still answers', async () => {
      const { deps, post } = setup()
      const res = await post(toolCalls([flag({ type: 'health', detail: 'fell' })], { type: 'webCall', customer: undefined }))
      expect(res.json.results).toEqual([{ toolCallId: 'tool-1', result: 'ok' }])
      expect(deps.findSeniorByPhone).not.toHaveBeenCalled()
    })
  })

  describe('other requests', () => {
    it('refuses a wrong or missing secret', async () => {
      const { deps, post } = setup()
      expect((await post(toolCalls([flag({ detail: 'fell' })]), { 'x-vapi-secret': 'nope' })).status).toBe(401)
      expect((await post(toolCalls([flag({ detail: 'fell' })]), {})).status).toBe(401)
      expect(deps.insertAlert).not.toHaveBeenCalled()
    })

    it('refuses everyone when no secret is configured', async () => {
      const { post } = setup({ secret: undefined })
      expect((await post(toolCalls([flag({ detail: 'fell' })]))).status).toBe(401)
    })

    it('ignores messages that are not tool calls', async () => {
      const { deps, post } = setup()
      const res = await post({ message: { type: 'end-of-call-report' } })
      expect(res.json).toEqual({ ok: true, ignored: true })
      expect(deps.findSeniorByPhone).not.toHaveBeenCalled()
    })

    it('answers other tools with "ok" and saves nothing', async () => {
      const { deps, post } = setup()
      const res = await post(toolCalls([{ id: 'tool-9', function: { name: 'something_else', arguments: {} } }]))
      expect(res.json).toEqual({ results: [{ toolCallId: 'tool-9', result: 'ok' }] })
      expect(deps.findSeniorByPhone).not.toHaveBeenCalled()
    })
  })
})
