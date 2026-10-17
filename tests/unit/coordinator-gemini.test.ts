import { describe, expect, it, vi } from 'vitest'
import { createGeminiChooser, type GenerateRequest } from '@/lib/coordinator/gemini'
import type { GeminiInput } from '@/lib/coordinator/run'

// The one Gemini call per coordinator run (specs/08-agents/coordinator-agent.md "v1: one Gemini call").
// The model is injected as `generate`, so these tests need no key or network.

const input: GeminiInput = {
  senior: { first_name: 'Rose' },
  opportunity: {
    type: 'gift_errand',
    quote: 'My zucchini are out of control.',
    summary: 'Has extra zucchini',
    interest_tags: ['gardening', 'cooking'],
    urgency: 'normal',
    mentioned_item: 'zucchini',
  },
  members: [
    {
      member_id: 'danny',
      name: 'Danny',
      relationship: 'grandchild',
      interests: ['cooking'],
      skills: [],
      activities_with_elder: ['gardening'],
      conversation_topics: [],
      profile_summary: 'Loves cooking with Rose.',
      slots: [
        { id: 'danny-1', starts_at: '2026-10-15T20:00:00.000Z', ends_at: '2026-10-15T22:00:00.000Z' },
        { id: 'danny-2', starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T16:00:00.000Z' },
      ],
    },
  ],
}

const decision = { member_id: 'danny', slot_ids: ['danny-1'], title: 'Hi', body: 'Come by', why: 'Likes cooking' }

function setup(text: string | undefined = JSON.stringify(decision)) {
  const generate = vi.fn<(request: GenerateRequest) => Promise<string | undefined>>().mockResolvedValue(text)
  return { generate, choose: createGeminiChooser({ generate, model: 'gemini-test' }) }
}

describe('createGeminiChooser', () => {
  it("returns the model's decision as an object", async () => {
    const { choose } = setup()
    expect(await choose(input)).toEqual(decision)
  })

  it('asks for JSON in the shape the coordinator validates, using the configured model', async () => {
    const { generate, choose } = setup()
    await choose(input)

    const request = generate.mock.calls[0][0]
    expect(request.model).toBe('gemini-test')
    expect(request.responseMimeType).toBe('application/json')
    expect(request.schema).toMatchObject({ required: expect.arrayContaining(['member_id', 'slot_ids', 'title', 'body', 'why']) })
  })

  it("gives the model the elder's first name, the quote, each member and every slot id with a readable time", async () => {
    const { generate, choose } = setup()
    await choose(input)

    const prompt = generate.mock.calls[0][0].prompt
    for (const part of ['Rose', 'My zucchini are out of control.', 'Danny', 'Loves cooking with Rose.', 'danny-1', 'danny-2']) {
      expect(prompt).toContain(part)
    }
    expect(prompt).toMatch(/Thu/) // slot times are written out, not left as ISO strings only
  })

  it('tells the model the rules: stay on the shortlist, be warm, never promise, never mention health', async () => {
    const { generate, choose } = setup()
    await choose(input)

    const prompt = generate.mock.calls[0][0].prompt.toLowerCase()
    expect(prompt).toContain('only')
    expect(prompt).toContain('health')
    expect(prompt).toMatch(/promise|guarantee/)
  })

  it('throws when the model returns nothing, so the coordinator falls back', async () => {
    await expect(setup(undefined).choose(input)).rejects.toThrow()
    await expect(setup('').choose(input)).rejects.toThrow()
  })

  it('throws when the model returns something that is not JSON', async () => {
    await expect(setup('Sure! Send Danny.').choose(input)).rejects.toThrow()
  })

  it('does not trim or fix a bad answer: validation is the coordinator\'s job', async () => {
    const bad = { ...decision, member_id: 'sam' }
    expect(await setup(JSON.stringify(bad)).choose(input)).toEqual(bad)
  })

  it('throws when the call itself fails', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('429 quota'))
    await expect(createGeminiChooser({ generate, model: 'm' })(input)).rejects.toThrow('429 quota')
  })
})
