import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient } from '../helpers/supabase'
import { createCheckIn, createSenior } from '../helpers/factories'
import { createWellbeingStore } from '@/lib/wellbeing/store'
import type { NewAlert, WellbeingCheckIn } from '@/lib/wellbeing/plan'

// The wellbeing agent's save against the real alerts table (checks and unique index included).

const row = (over: Partial<NewAlert> = {}): NewAlert => ({
  type: 'low_mood',
  severity: 'info',
  message: 'The elder feels lonely.',
  category: 'loneliness',
  quote: 'I feel so lonely.',
  support_needed: 'companionship',
  suggested_followup: 'Unknown',
  safety: 'routine',
  confidence: 0.9,
  ...over,
})

async function setup() {
  const senior = await createSenior()
  const checkIn = (await createCheckIn(senior.id as string)) as unknown as WellbeingCheckIn
  const rows = async () => (await adminClient().from('alerts').select('*').eq('check_in_id', checkIn.id)).data ?? []
  return { checkIn, store: createWellbeingStore(adminClient()), rows }
}

describe.skipIf(!hasTestDb())('wellbeing save (real database)', () => {
  it('saves every alert tied to the check-in', async () => {
    const { checkIn, store, rows } = await setup()
    await store.saveAlerts(checkIn, [row(), row({ type: 'health', severity: 'warn', category: 'physical_incident', quote: 'I fell.', safety: 'needs_review' })])
    expect(await rows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'loneliness', source: 'wellbeing', senior_id: checkIn.senior_id }),
        expect.objectContaining({ type: 'health', severity: 'warn', safety: 'needs_review' }),
      ]),
    )
  })

  it('a repeat run adds nothing', async () => {
    const { checkIn, store, rows } = await setup()
    await store.saveAlerts(checkIn, [row()])
    await store.saveAlerts(checkIn, [row(), row({ quote: 'Nobody calls.' })])
    expect(await rows()).toHaveLength(2)
  })

  it('saves none when one row is invalid', async () => {
    const { checkIn, store, rows } = await setup()
    await expect(store.saveAlerts(checkIn, [row(), row({ quote: 'x', safety: 'fine' as never })])).rejects.toThrow('Could not save the alerts')
    expect(await rows()).toHaveLength(0)
  })

  it('stores the extraction marker', async () => {
    const { checkIn, store } = await setup()
    await store.saveResult(checkIn.id, { status: 'ok', count: 1 })
    const { data } = await adminClient().from('check_ins').select('wellbeing_extraction').eq('id', checkIn.id).single()
    expect(data?.wellbeing_extraction).toEqual({ status: 'ok', count: 1 })
  })
})
