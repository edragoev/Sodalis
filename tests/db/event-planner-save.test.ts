import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient } from '../helpers/supabase'
import { createCheckIn, createSenior } from '../helpers/factories'
import { createPlannerStore } from '@/lib/event-planner/store'
import type { NewOpportunity, PlannerCheckIn } from '@/lib/event-planner/plan'

// The event planner's save against the real opportunities table (checks and unique index included).

const idea = (over: Partial<NewOpportunity> = {}): NewOpportunity => ({
  type: 'activity',
  summary: 'Misses cards',
  quote: 'I miss cards.',
  mentioned_member_id: null,
  mentioned_item: 'cards',
  interest_tags: ['games'],
  target_date: null,
  urgency: 'normal',
  confidence: 0.8,
  suggested_kind: 'visit',
  ...over,
})

async function setup() {
  const senior = await createSenior()
  const checkIn = (await createCheckIn(senior.id as string)) as unknown as PlannerCheckIn
  const rows = async () => (await adminClient().from('opportunities').select('*').eq('check_in_id', checkIn.id)).data ?? []
  return { checkIn, store: createPlannerStore(adminClient()), rows }
}

describe.skipIf(!hasTestDb())('event planner save (real database)', () => {
  it('saves every idea tied to the check-in and the call', async () => {
    const { checkIn, store, rows } = await setup()
    await store.saveIdeas(checkIn, [idea(), idea({ type: 'event', mentioned_item: 'tea', target_date: '2030-01-02' })])

    expect(await rows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'activity', source: 'extraction', status: 'detected', check_in_vapi_call_id: checkIn.vapi_call_id }),
        expect.objectContaining({ type: 'event', target_date: '2030-01-02', mentioned_item: 'tea' }),
      ]),
    )
    expect(await rows()).toHaveLength(2)
  })

  it('saves nothing when one idea breaks a table rule (all or nothing)', async () => {
    const { checkIn, store, rows } = await setup()
    await expect(store.saveIdeas(checkIn, [idea(), idea({ type: 'event', mentioned_item: 'tea', confidence: 7 })])).rejects.toThrow('Could not save the opportunities')
    expect(await rows()).toHaveLength(0)
  })

  it('a repeat run adds nothing, and a run with one new idea adds only that one', async () => {
    const { checkIn, store, rows } = await setup()
    await store.saveIdeas(checkIn, [idea()])
    await store.saveIdeas(checkIn, [idea()])
    expect(await rows()).toHaveLength(1)

    await store.saveIdeas(checkIn, [idea(), idea({ mentioned_item: 'tea' }), idea({ mentioned_item: null })])
    expect(await rows()).toHaveLength(3)
  })
})
