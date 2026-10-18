import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoordinator, type CoordinatorDeps } from '@/lib/coordinator/run'

// One coordinator run for an opportunity: shortlist, slots, one Gemini call, validation, fallback,
// then the push (specs/08-agents/coordinator-agent.md). Every collaborator is injected, so no database,
// Gemini or Firebase is involved.

const member = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  relationship: 'grandchild',
  interests: [],
  skills: [],
  activities_with_elder: [],
  conversation_topics: [],
  constraints: {},
  profile_summary: null,
  ...over,
})

const opportunity = (over: Record<string, unknown> = {}) => ({
  id: 'opp-1',
  senior_id: 'senior-1',
  type: 'gift_errand',
  summary: 'Has extra zucchini',
  quote: 'My zucchini are out of control.',
  mentioned_item: 'zucchini',
  activity: 'Bring extra zucchini',
  interest_tags: ['gardening', 'cooking'],
  mentioned_member_id: null,
  target_date: null,
  urgency: 'normal',
  status: 'detected',
  ...over,
})

const slotsFor = (id: string) => [
  { id: `${id}-1`, starts_at: '2026-10-15T20:00:00Z', ends_at: '2026-10-15T22:00:00Z' },
  { id: `${id}-2`, starts_at: '2026-10-16T14:00:00Z', ends_at: '2026-10-16T16:00:00Z' },
  { id: `${id}-3`, starts_at: '2026-10-17T18:00:00Z', ends_at: '2026-10-17T20:00:00Z' },
]

const goodDecision = (over: Record<string, unknown> = {}) => ({
  member_id: 'danny',
  slot_ids: ['danny-1', 'danny-2'],
  title: 'Grandma would love to see you',
  body: "'My zucchini are out of control.' Thu 4pm or Fri 10am?",
  why: 'Grandma asked for Danny by name.',
  ...over,
})

function setup(over: Partial<CoordinatorDeps> = {}) {
  const deps = {
    loadContext: vi.fn().mockResolvedValue({
      opportunity: opportunity({ mentioned_member_id: 'danny' }),
      senior: { first_name: 'Rose', timezone: 'America/Toronto' },
      members: [member('danny'), member('maya')],
    }),
    getSlots: vi.fn(async (memberId: string) => slotsFor(memberId)),
    chooseWithGemini: vi.fn().mockResolvedValue(goodDecision()),
    saveProposal: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
    recordRun: vi.fn().mockResolvedValue(undefined),
    timeoutMs: 5000,
    ...over,
  } satisfies CoordinatorDeps
  return { deps, coordinate: createCoordinator(deps) }
}

describe('coordinator run', () => {
  describe('a named member', () => {
    it('asks Gemini about that member only, with their slots and the elder\'s first name', async () => {
      const { deps, coordinate } = setup()

      await coordinate('opp-1')

      expect(deps.chooseWithGemini).toHaveBeenCalledTimes(1)
      const input = deps.chooseWithGemini.mock.calls[0][0]
      expect(input.senior.first_name).toBe('Rose')
      expect(input.members.map((m: { member_id: string }) => m.member_id)).toEqual(['danny'])
      expect(input.members[0].slots.map((s: { id: string }) => s.id)).toEqual(['danny-1', 'danny-2', 'danny-3'])
      expect(input.opportunity).toMatchObject({ type: 'gift_errand', quote: 'My zucchini are out of control.' })
    })

    it("saves the proposal with only the chosen slots, then pushes Gemini's words to that member", async () => {
      const { deps, coordinate } = setup()

      const result = await coordinate('opp-1')

      expect(result).toMatchObject({ status: 'proposed', usedFallback: false })
      expect(deps.saveProposal).toHaveBeenCalledWith('opp-1', {
        notified_member_ids: ['danny'],
        proposed_slots: [slotsFor('danny')[0], slotsFor('danny')[1]],
      })
      expect(deps.push).toHaveBeenCalledTimes(1)
      const [memberIds, content] = deps.push.mock.calls[0]
      expect(memberIds).toEqual(['danny'])
      expect(content).toMatchObject({
        opportunity_id: 'opp-1',
        title: 'Grandma would love to see you',
        body: "'My zucchini are out of control.' Thu 4pm or Fri 10am?",
        urgency: 'normal',
        slot_ids: ['danny-1', 'danny-2'],
        timezone: 'America/Toronto',
      })
    })

    it('saves the proposal before pushing, because the page the push opens reads it', async () => {
      const order: string[] = []
      const { coordinate } = setup({
        saveProposal: vi.fn(async () => void order.push('save')),
        push: vi.fn(async () => (order.push('push'), { successCount: 1, failureCount: 0 })),
      })
      await coordinate('opp-1')
      expect(order).toEqual(['save', 'push'])
    })

    it('writes one agent_runs row with the input, the output and the why', async () => {
      const { deps, coordinate } = setup()
      await coordinate('opp-1')
      expect(deps.recordRun).toHaveBeenCalledTimes(1)
      expect(deps.recordRun.mock.calls[0][0]).toMatchObject({
        opportunity_id: 'opp-1',
        used_fallback: false,
        output: goodDecision(),
      })
      expect(deps.recordRun.mock.calls[0][0].input).toBeDefined()
    })
  })

  describe('no member named', () => {
    it('shortlists by match and only sends Gemini members that have slots', async () => {
      const { deps, coordinate } = setup({
        loadContext: vi.fn().mockResolvedValue({
          opportunity: opportunity(),
          senior: { first_name: 'Rose', timezone: 'America/Toronto' },
          members: [
            member('danny', { activities_with_elder: ['cooking', 'gardening'] }),
            member('maya', { activities_with_elder: ['cooking', 'gardening'] }),
            member('sam', { interests: ['chess'] }),
          ],
        }),
        getSlots: vi.fn(async (id: string) => (id === 'maya' ? [] : slotsFor(id))),
        chooseWithGemini: vi.fn().mockResolvedValue(goodDecision()),
      })

      await coordinate('opp-1')

      const ids = deps.chooseWithGemini.mock.calls[0][0].members.map((m: { member_id: string }) => m.member_id)
      expect(ids).toEqual(['danny'])
    })
  })

  describe('when Gemini cannot be used (template fallback)', () => {
    it.each([
      ['a member who is not on the shortlist', goodDecision({ member_id: 'sam' })],
      ["a slot that is not that member's", goodDecision({ slot_ids: ['maya-1'] })],
      ['text that mentions health', goodDecision({ body: 'Her blood pressure is up. Thu 4pm?' })],
      ['something that is not a decision', 'sure, send Danny'],
    ])('falls back for %s', async (_name, bad) => {
      const { deps, coordinate } = setup({ chooseWithGemini: vi.fn().mockResolvedValue(bad) })

      const result = await coordinate('opp-1')

      expect(result).toMatchObject({ status: 'proposed', usedFallback: true })
      expect(deps.saveProposal).toHaveBeenCalledWith('opp-1', {
        notified_member_ids: ['danny'],
        proposed_slots: slotsFor('danny'),
      })
      expect(deps.push.mock.calls[0][1].title).toBe('Bring extra zucchini to Rose?')
      expect(deps.recordRun.mock.calls[0][0]).toMatchObject({ used_fallback: true })
      expect(deps.recordRun.mock.calls[0][0].fallback_reason).toEqual(expect.any(String))
    })

    it('falls back when the Gemini call throws', async () => {
      const { deps, coordinate } = setup({ chooseWithGemini: vi.fn().mockRejectedValue(new Error('429')) })
      const result = await coordinate('opp-1')
      expect(result).toMatchObject({ status: 'proposed', usedFallback: true })
      expect(deps.push).toHaveBeenCalledTimes(1)
    })

    describe('when Gemini is slow', () => {
      beforeEach(() => void vi.useFakeTimers())
      afterEach(() => void vi.useRealTimers())

      it('gives up after the timeout and falls back', async () => {
        const { deps, coordinate } = setup({ chooseWithGemini: vi.fn(() => new Promise(() => {})), timeoutMs: 5000 })

        const run = coordinate('opp-1')
        await vi.advanceTimersByTimeAsync(5000)

        expect(await run).toMatchObject({ status: 'proposed', usedFallback: true })
        expect(deps.recordRun.mock.calls[0][0].fallback_reason).toMatch(/timeout/i)
      })
    })
  })

  describe('when there is nothing to send', () => {
    it('sends nothing, and keeps the opportunity as detected, when nobody has a free slot', async () => {
      const { deps, coordinate } = setup({ getSlots: vi.fn().mockResolvedValue([]) })

      const result = await coordinate('opp-1')

      expect(result).toMatchObject({ status: 'no_slots' })
      expect(deps.chooseWithGemini).not.toHaveBeenCalled()
      expect(deps.saveProposal).not.toHaveBeenCalled()
      expect(deps.push).not.toHaveBeenCalled()
      expect(deps.recordRun.mock.calls[0][0]).toMatchObject({ reason: 'no_slots' })
    })

    it('answers not_found for an opportunity that does not exist', async () => {
      const { deps, coordinate } = setup({ loadContext: vi.fn().mockResolvedValue(null) })
      expect(await coordinate('missing')).toMatchObject({ status: 'not_found' })
      expect(deps.push).not.toHaveBeenCalled()
    })

    it.each(['proposed', 'confirmed', 'declined', 'expired'])(
      'does nothing for an opportunity that is already %s, so a retry never sends a second push',
      async (status) => {
        const { deps, coordinate } = setup({
          loadContext: vi.fn().mockResolvedValue({
            opportunity: opportunity({ status, mentioned_member_id: 'danny' }),
            senior: { first_name: 'Rose', timezone: 'UTC' },
            members: [member('danny')],
          }),
        })

        expect(await coordinate('opp-1')).toMatchObject({ status: 'skipped' })
        expect(deps.chooseWithGemini).not.toHaveBeenCalled()
        expect(deps.push).not.toHaveBeenCalled()
      },
    )
  })

  describe('failures', () => {
    it('keeps the saved proposal, and reports it, when the push fails', async () => {
      const { deps, coordinate } = setup({ push: vi.fn().mockRejectedValue(new Error('fcm down')) })

      const result = await coordinate('opp-1')

      expect(result).toMatchObject({ status: 'proposed', pushed: false })
      expect(deps.saveProposal).toHaveBeenCalledTimes(1)
    })

    it('reports pushed: false when no member has a registered device', async () => {
      const { coordinate } = setup({ push: vi.fn().mockResolvedValue({ successCount: 0, failureCount: 0 }) })
      expect(await coordinate('opp-1')).toMatchObject({ status: 'proposed', pushed: false })
    })

    it('never pushes when the proposal cannot be saved, and lets the error out', async () => {
      const { deps, coordinate } = setup({ saveProposal: vi.fn().mockRejectedValue(new Error('db down')) })
      await expect(coordinate('opp-1')).rejects.toThrow('db down')
      expect(deps.push).not.toHaveBeenCalled()
    })

    it('does not fail the run when the trace cannot be written', async () => {
      const { deps, coordinate } = setup({ recordRun: vi.fn().mockRejectedValue(new Error('no table')) })
      expect(await coordinate('opp-1')).toMatchObject({ status: 'proposed' })
      expect(deps.push).toHaveBeenCalledTimes(1)
    })
  })
})
