import { describe, expect, it, vi } from 'vitest'
import { buildPrompt, responseSchema } from '@/lib/event-planner/gemini'
import { createEventPlanner, type PlannerDeps } from '@/lib/event-planner/plan'

// The event planner pipeline with every collaborator faked: no database, Gemini or Firebase.

const TRANSCRIPT = "AI: Hello Rose!\nUser: My zucchini are out of control this year. Danny loves them, you know."
const members = [
  { id: 'danny', name: 'Danny', relationship: 'Grandson', pronouns: 'he/him' },
  { id: 'maya', name: 'Maya', relationship: 'Granddaughter', pronouns: null },
]
const idea = (over: Record<string, unknown> = {}) => ({
  type: 'gift_errand',
  summary: 'The elder has more zucchini than they can use.',
  quote: 'My zucchini are out of control this year.',
  mentioned_member: 'Danny',
  mentioned_item: 'zucchini',
  interest_tags: ['gardening'],
  target_date: '2026-10-18',
  urgency: 'normal',
  confidence: 0.86,
  suggested_kind: 'visit',
  ...over,
})

function setup(over: Partial<PlannerDeps> = {}, ctx: Record<string, unknown> = {}) {
  const deps = {
    load: vi.fn().mockResolvedValue({
      checkIn: { id: 'ci-1', senior_id: 's-1', vapi_call_id: 'call-1', transcript: TRANSCRIPT, started_at: '2026-10-15T14:00:00Z', ended_at: '2026-10-15T14:05:00Z', raw_extraction: null },
      senior: { first_name: 'Rose', timezone: 'America/Toronto' },
      members,
      recent: [],
      ...ctx,
    }),
    extract: vi.fn().mockResolvedValue({ opportunities: [idea()] }),
    saveIdeas: vi.fn().mockResolvedValue(undefined),
    openIds: vi.fn().mockResolvedValue(['opp-1']),
    saveResult: vi.fn().mockResolvedValue(undefined),
    propose: vi.fn().mockResolvedValue(undefined),
    outcomes: vi.fn().mockResolvedValue([{ id: 'opp-1', status: 'proposed', notified_member_ids: ['danny'], proposed_slots: [] }]),
    now: () => new Date('2026-10-15T15:00:00Z'),
    timeoutMs: 1000,
    ...over,
  } satisfies PlannerDeps
  return { deps, plan: createEventPlanner(deps) }
}

describe('event planner', () => {
  it('makes one Gemini call, saves the idea for the named member, then proposes it', async () => {
    const { deps, plan } = setup()

    const result = await plan('ci-1')

    expect(deps.extract).toHaveBeenCalledTimes(1)
    expect(deps.extract.mock.calls[0][0]).toMatchObject({ today: '2026-10-15', senior: { first_name: 'Rose' } })
    expect(deps.saveIdeas).toHaveBeenCalledWith(expect.objectContaining({ id: 'ci-1' }), [
      expect.objectContaining({ mentioned_member_id: 'danny', target_date: '2026-10-18', confidence: 0.86 }),
    ])
    expect(deps.propose).toHaveBeenCalledWith('opp-1')
    expect(result).toMatchObject({
      status: 'done',
      ideas: [{ matched_member_id: 'danny', target_date: '2026-10-18', skipped: null }],
      proposals: [{ id: 'opp-1', member_names: ['Danny'] }],
    })
  })

  it('marks the extraction done only after the opportunities are saved', async () => {
    const order: string[] = []
    const { plan } = setup({
      saveIdeas: vi.fn(async () => void order.push('ideas')),
      saveResult: vi.fn(async (_id, rec) => void order.push(`result:${rec.status}`)),
    })
    await plan('ci-1')
    expect(order).toEqual(['ideas', 'result:ok'])
  })

  it('does nothing for an unknown check-in, a call without a transcript, or one already done', async () => {
    expect((await setup({ load: vi.fn().mockResolvedValue(null) }).plan('x')).status).toBe('not_found')

    const blank = setup({}, { checkIn: { id: 'ci-1', transcript: '  ', started_at: '2026-10-15T14:00:00Z', ended_at: null, raw_extraction: null } })
    expect((await blank.plan('ci-1')).status).toBe('no_transcript')
    expect(blank.deps.extract).not.toHaveBeenCalled()

    const done = setup({}, { checkIn: { id: 'ci-1', senior_id: 's', vapi_call_id: 'c', transcript: TRANSCRIPT, started_at: '2026-10-15T14:00:00Z', ended_at: null, raw_extraction: { status: 'ok' } } })
    expect((await done.plan('ci-1')).status).toBe('already_done')
    expect(done.deps.extract).not.toHaveBeenCalled()
    expect((await done.plan('ci-1', { force: true })).status).toBe('done')
  })

  it('retries after an earlier failure', async () => {
    const { deps, plan } = setup({}, { checkIn: { id: 'ci-1', senior_id: 's', vapi_call_id: 'c', transcript: TRANSCRIPT, started_at: '2026-10-15T14:00:00Z', ended_at: null, raw_extraction: { status: 'failed' } } })
    expect((await plan('ci-1')).status).toBe('done')
    expect(deps.extract).toHaveBeenCalled()
  })

  describe('member matching', () => {
    it('treats an unknown name as unnamed and notes it in the summary', async () => {
      const { deps, plan } = setup({ extract: vi.fn().mockResolvedValue({ opportunities: [idea({ mentioned_member: 'Priya' })] }) })
      const result = await plan('ci-1')
      expect(deps.saveIdeas.mock.calls[0][1][0]).toMatchObject({ mentioned_member_id: null, summary: expect.stringContaining('"Priya"') })
      expect(result).toMatchObject({ ideas: [{ member_note: 'unknown_member', matched_member_id: null }] })
    })

    it('does not pick between two members who share the mention', async () => {
      const { deps, plan } = setup({ extract: vi.fn().mockResolvedValue({ opportunities: [idea({ mentioned_member: 'my grandchild' })] }) })
      const result = await plan('ci-1')
      expect(deps.saveIdeas.mock.calls[0][1][0].mentioned_member_id).toBeNull()
      expect(result).toMatchObject({ ideas: [{ member_note: 'ambiguous_member' }] })
    })
  })

  describe('dedup', () => {
    it('skips an idea Hope already created during the call', async () => {
      const { deps, plan } = setup({}, { recent: [{ type: 'gift_errand', mentioned_member_id: 'danny', mentioned_item: 'Zucchini' }] })
      const result = await plan('ci-1')
      expect(deps.saveIdeas.mock.calls[0][1]).toEqual([])
      expect(result).toMatchObject({ ideas: [{ skipped: 'duplicate' }] })
    })

    describe('one push per wish', () => {
      const missesDanny = idea({ type: 'wants_contact', mentioned_item: null, quote: 'Danny loves them, you know.' })
      const missesSomeone = idea({ type: 'wants_contact', mentioned_member: null, mentioned_item: null })
      const plan = (...opportunities: unknown[]) => {
        const s = setup({ extract: vi.fn().mockResolvedValue({ opportunities }) })
        return s.plan('ci-1').then((result) => ({ result, saved: s.deps.saveIdeas.mock.calls[0][1] }))
      }

      it('drops "misses Danny" when the same call has a specific plan with Danny', async () => {
        const { result, saved } = await plan(missesDanny, idea())
        expect(saved).toHaveLength(1)
        expect(saved[0]).toMatchObject({ type: 'gift_errand', mentioned_member_id: 'danny' })
        expect(result).toMatchObject({ ideas: [{ type: 'wants_contact', skipped: 'covered' }, { type: 'gift_errand', skipped: null }] })
      })

      it('also when the specific plan comes first in the answer', async () => {
        const { saved } = await plan(idea(), missesDanny)
        expect(saved.map((r: { type: string }) => r.type)).toEqual(['gift_errand'])
      })

      it('drops an unnamed "misses someone" when the call has any specific plan', async () => {
        const { saved } = await plan(missesSomeone, idea())
        expect(saved.map((r: { type: string }) => r.type)).toEqual(['gift_errand'])
      })

      it('keeps "misses Danny" when the only plan is with someone else', async () => {
        const { saved } = await plan(missesDanny, idea({ mentioned_member: 'Maya' }))
        expect(saved.map((r: { type: string }) => r.type)).toEqual(['wants_contact', 'gift_errand'])
      })

      it('keeps "misses Danny" when there is no specific plan', async () => {
        const { saved } = await plan(missesDanny)
        expect(saved).toHaveLength(1)
        expect(saved[0].type).toBe('wants_contact')
      })

      it('keeps two different plans with the same member', async () => {
        const { saved } = await plan(idea(), idea({ type: 'activity', mentioned_item: 'baking' }))
        expect(saved).toHaveLength(2)
      })
    })

    it('collapses a repeat inside the same answer', async () => {
      const { deps, plan } = setup({ extract: vi.fn().mockResolvedValue({ opportunities: [idea(), idea({ confidence: 0.7 })] }) })
      await plan('ci-1')
      expect(deps.saveIdeas.mock.calls[0][1]).toHaveLength(1)
    })

    it('keeps different items apart', async () => {
      const { deps, plan } = setup({ extract: vi.fn().mockResolvedValue({ opportunities: [idea(), idea({ mentioned_item: 'tomatoes' })] }) })
      await plan('ci-1')
      expect(deps.saveIdeas.mock.calls[0][1]).toHaveLength(2)
    })
  })

  describe('failure', () => {
    it.each([
      ['Gemini throws', { extract: vi.fn().mockRejectedValue(new Error('boom')) }, 'boom'],
      ['invalid output', { extract: vi.fn().mockResolvedValue('garbage') }, 'invalid_output'],
      ['a timeout', { extract: vi.fn(() => new Promise(() => {})), timeoutMs: 10 }, 'timeout'],
    ])('records %s on the check-in and proposes nothing', async (_name, over, reason) => {
      const { deps, plan } = setup(over as Partial<PlannerDeps>)
      const result = await plan('ci-1')
      expect(result).toMatchObject({ status: 'failed', reason })
      expect(deps.saveResult).toHaveBeenCalledWith('ci-1', expect.objectContaining({ status: 'failed', reason }))
      expect(deps.saveIdeas).not.toHaveBeenCalled()
      expect(deps.propose).not.toHaveBeenCalled()
    })

    it('flags a quota refusal and how long to wait', async () => {
      const err = Object.assign(new Error('You exceeded your current quota. Please retry in 36m.'), { status: 429 })
      const { deps, plan } = setup({ extract: vi.fn().mockRejectedValue(err) })
      expect(await plan('ci-1')).toMatchObject({ status: 'failed', quota: true })
      expect(deps.saveResult.mock.calls[0][1]).toMatchObject({ quota: true, retry_after_ms: 36 * 60_000 })
    })

    it('does not mark the extraction done when saving fails', async () => {
      const { deps, plan } = setup({ saveIdeas: vi.fn().mockRejectedValue(new Error('db')) })
      expect((await plan('ci-1')).status).toBe('failed')
      expect(deps.saveResult).not.toHaveBeenCalledWith('ci-1', expect.objectContaining({ status: 'ok' }))
      expect(deps.propose).not.toHaveBeenCalled()
    })

    it('still returns when recording the failure itself fails', async () => {
      const { plan } = setup({ extract: vi.fn().mockRejectedValue(new Error('boom')), saveResult: vi.fn().mockRejectedValue(new Error('db')) })
      expect((await plan('ci-1')).status).toBe('failed')
    })
  })

  it('keeps proposing when one coordinator run fails', async () => {
    const { deps, plan } = setup({
      openIds: vi.fn().mockResolvedValue(['a', 'b']),
      propose: vi.fn().mockRejectedValueOnce(new Error('push down')).mockResolvedValue(undefined),
    })
    expect((await plan('ci-1')).status).toBe('done')
    expect(deps.propose).toHaveBeenCalledTimes(2)
  })

  it('gives a plan that names no one to the person the elder said she misses, in one push', async () => {
    const transcript = 'User: I do miss Danny. We used to garden together.'
    const { deps, plan } = setup(
      {
        extract: vi.fn().mockResolvedValue({
          opportunities: [
            idea({ type: 'wants_contact', quote: 'I do miss Danny', mentioned_member: 'Danny', mentioned_item: null }),
            idea({ type: 'activity', quote: 'We used to garden together', mentioned_member: null, mentioned_item: 'garden' }),
          ],
        }),
      },
      { checkIn: { id: 'ci-1', senior_id: 's-1', vapi_call_id: 'call-1', transcript, started_at: '2026-10-15T14:00:00Z', ended_at: null, raw_extraction: null } },
    )
    await plan('ci-1')
    const saved = deps.saveIdeas.mock.calls[0][1]
    expect(saved).toEqual([expect.objectContaining({ type: 'activity', mentioned_member_id: 'danny' })])
  })

  it('matches "my kids" to every child, never silently to one of them', async () => {
    const { matchMentionedMember } = await import('@/lib/event-planner/members')
    const family = [
      { id: 'sarah', name: 'Sarah', relationship: 'Daughter', pronouns: null },
      { id: 'sam', name: 'Sam', relationship: 'Son', pronouns: null },
    ]
    expect(matchMentionedMember('my kids', family)).toEqual({ kind: 'several', members: family })
    expect(matchMentionedMember('my daughter', family)).toEqual({ kind: 'one', member: family[0] })
  })

  it('pushes only the best idea: stops after the first one the coordinator proposes', async () => {
    const { deps, plan } = setup({
      openIds: vi.fn().mockResolvedValue(['best', 'next', 'last']),
      propose: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
    })
    await plan('ci-1')
    expect(deps.propose.mock.calls.map((c) => c[0])).toEqual(['best', 'next'])
  })

  it('reads the date in the elder’s timezone from when the call ended', async () => {
    const { deps, plan } = setup({}, { checkIn: { id: 'ci-1', senior_id: 's', vapi_call_id: 'c', transcript: TRANSCRIPT, started_at: '2026-10-16T01:00:00Z', ended_at: '2026-10-16T01:05:00Z', raw_extraction: null } })
    await plan('ci-1')
    expect(deps.extract.mock.calls[0][0].today).toBe('2026-10-15')
  })
})

describe('the Gemini request', () => {
  const prompt = buildPrompt({
    transcript: TRANSCRIPT,
    senior: { first_name: 'Rose', timezone: 'America/Toronto' },
    today: '2026-10-15',
    members: [{ name: 'Danny', relationship: 'Grandson', pronouns: null }],
  })

  it('carries the date, the family and the rules, and defaults pronouns to they/them', () => {
    expect(prompt).toContain('Today is 2026-10-15')
    expect(prompt).toContain('Danny (Grandson; pronouns they/them)')
    expect(prompt).toMatch(/Health.*NOT opportunities/)
  })

  it('declares every field as required and the closed enums', () => {
    const item = responseSchema.properties.opportunities.items
    expect(item.required).toHaveLength(11)
    expect(item.required).toContain('activity')
    expect(item.properties.type.enum).toEqual(['gift_errand', 'activity', 'event', 'wants_contact'])
    expect(responseSchema.required).toEqual(['opportunities'])
  })
})
