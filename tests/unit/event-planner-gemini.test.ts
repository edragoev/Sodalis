import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// extractWithGemini with the Google SDK replaced: no network, no key.

const generateContent = vi.fn()
const ctor = vi.fn()
vi.mock('@google/genai', () => ({
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
  GoogleGenAI: class {
    models = { generateContent }
    constructor(opts: unknown) {
      ctor(opts)
    }
  },
}))

const input = { transcript: 'User: hi', senior: { first_name: 'Rose', timezone: 'UTC' }, today: '2026-10-15', members: [] }

describe('extractWithGemini', () => {
  beforeEach(() => {
    vi.resetModules()
    generateContent.mockReset()
    ctor.mockReset()
    vi.stubEnv('GEMINI_API_KEY', 'k')
    vi.stubEnv('GEMINI_MODEL', 'test-model')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('asks once for JSON with the schema and the model from the environment, and parses the answer', async () => {
    generateContent.mockResolvedValue({ text: '{"opportunities":[]}' })
    const { extractWithGemini } = await import('@/lib/event-planner/gemini')

    expect(await extractWithGemini(input)).toEqual({ opportunities: [] })

    expect(generateContent).toHaveBeenCalledTimes(1)
    expect(generateContent.mock.calls[0][0]).toMatchObject({
      model: 'test-model',
      config: { responseMimeType: 'application/json', temperature: 0 },
    })
    expect(generateContent.mock.calls[0][0].contents).toContain('User: hi')
    expect(ctor.mock.calls[0][0].httpOptions.retryOptions).toEqual({ attempts: 1 })
  })

  it.each(['GEMINI_API_KEY', 'GEMINI_MODEL'])('refuses to call Gemini when %s is missing', async (name) => {
    vi.stubEnv(name, '')
    const { extractWithGemini } = await import('@/lib/event-planner/gemini')
    await expect(extractWithGemini(input)).rejects.toThrow('Gemini env vars are not set')
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('throws on text that is not JSON, for the planner to record', async () => {
    generateContent.mockResolvedValue({ text: 'Sorry, I cannot' })
    const { extractWithGemini } = await import('@/lib/event-planner/gemini')
    await expect(extractWithGemini(input)).rejects.toThrow()
  })

  it('stops asking after a quota refusal, without calling Gemini again', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('You exceeded your current quota. Please retry in 36m.'), { status: 429 }))
    const { extractWithGemini } = await import('@/lib/event-planner/gemini')

    await expect(extractWithGemini(input)).rejects.toThrow('quota')
    await expect(extractWithGemini(input)).rejects.toThrow('waiting before asking again')
    expect(generateContent).toHaveBeenCalledTimes(1)
  })

  it('keeps asking after an ordinary failure', async () => {
    generateContent.mockRejectedValue(new Error('503 overloaded'))
    const { extractWithGemini } = await import('@/lib/event-planner/gemini')
    await expect(extractWithGemini(input)).rejects.toThrow('503')
    await expect(extractWithGemini(input)).rejects.toThrow('503')
    // Each call tries twice (a 503 is worth one retry), and the second call is not blocked by the first.
    expect(generateContent).toHaveBeenCalledTimes(4)
  })
})
