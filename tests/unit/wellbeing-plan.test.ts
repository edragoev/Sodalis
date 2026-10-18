import { describe, expect, it, vi } from 'vitest'
import { createWellbeingPlanner, toRow, type PlannerDeps, type WellbeingContext } from '@/lib/wellbeing/plan'

const TRANSCRIPT = "AI: Hi Rose!\nUser: I feel so lonely these days.\nUser: I fell in the kitchen and couldn't get up."
const alert = (over: Record<string, unknown> = {}) => ({
  category: 'loneliness',
  summary: 'The elder feels lonely.',
  quote: 'I feel so lonely these days.',
  support_needed: 'companionship',
  suggested_followup: 'A family member could call.',
  safety: 'routine',
  confidence: 0.9,
  ...over,
})

function setup(over: Partial<PlannerDeps> = {}, ctx: Partial<WellbeingContext['checkIn']> = {}) {
  const context: WellbeingContext = {
    checkIn: { id: 'ci-1', senior_id: 's-1', transcript: TRANSCRIPT, started_at: '2026-10-15T14:00:00Z', ended_at: '2026-10-15T14:05:00Z', wellbeing_extraction: null, ...ctx },
    senior: { first_name: 'Rose', timezone: 'America/Los_Angeles' },
  }
  const deps = {
    load: vi.fn().mockResolvedValue(context),
    extract: vi.fn().mockResolvedValue({ alerts: [alert()] }),
    saveAlerts: vi.fn().mockResolvedValue(undefined),
    saveResult: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn().mockResolvedValue(undefined),
    now: () => new Date('2026-10-15T15:00:00Z'),
    timeoutMs: 1000,
    ...over,
  } satisfies PlannerDeps
  return { deps, plan: createWellbeingPlanner(deps) }
}

describe('wellbeing planner', () => {
  it('saves a routine alert with legacy fields and does not notify', async () => {
    const { deps, plan } = setup()
    const r = await plan('ci-1')
    expect(r).toMatchObject({ status: 'done', notified: null })
    expect(deps.saveAlerts.mock.calls[0][1][0]).toMatchObject({ type: 'low_mood', severity: 'info', category: 'loneliness', safety: 'routine' })
    expect(deps.saveResult).toHaveBeenCalledWith('ci-1', expect.objectContaining({ status: 'ok', count: 1 }))
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('sends only the transcript, first name and date to Gemini', async () => {
    const { deps, plan } = setup()
    await plan('ci-1')
    expect(deps.extract).toHaveBeenCalledWith({ transcript: TRANSCRIPT, senior: { first_name: 'Rose' }, today: '2026-10-15' })
  })

  it('handles no concerns without saving or notifying', async () => {
    const { deps, plan } = setup({ extract: vi.fn().mockResolvedValue({ alerts: [] }) })
    expect(await plan('ci-1')).toMatchObject({ status: 'done', alerts: [], notified: null })
    expect(deps.saveAlerts).toHaveBeenCalledWith(expect.anything(), [])
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('notifies for a fall even if Gemini said routine', async () => {
    const q = "I fell in the kitchen and couldn't get up."
    const { deps, plan } = setup({ extract: vi.fn().mockResolvedValue({ alerts: [alert({ category: 'physical_incident', quote: q, summary: 'A fall.', safety: 'routine' })] }) })
    expect(await plan('ci-1')).toMatchObject({ notified: 'needs_review' })
    expect(deps.saveAlerts.mock.calls[0][1][0]).toMatchObject({ type: 'health', severity: 'warn' })
    expect(deps.notify).toHaveBeenCalledWith(expect.anything(), 'needs_review')
  })

  it('notifies urgent once, at the highest level', async () => {
    const q = "I fell in the kitchen and couldn't get up."
    const { deps, plan } = setup({ extract: vi.fn().mockResolvedValue({ alerts: [alert({ safety: 'needs_review' }), alert({ quote: q, safety: 'urgent' })] }) })
    await plan('ci-1')
    expect(deps.notify).toHaveBeenCalledTimes(1)
    expect(deps.notify).toHaveBeenCalledWith(expect.anything(), 'urgent')
  })

  it('still reports done when the push fails', async () => {
    const { plan } = setup({ extract: vi.fn().mockResolvedValue({ alerts: [alert({ safety: 'urgent' })] }), notify: vi.fn().mockRejectedValue(new Error('fcm')) })
    expect(await plan('ci-1')).toMatchObject({ status: 'done' })
  })

  it('does not rerun a finished extraction unless forced', async () => {
    const { deps, plan } = setup({}, { wellbeing_extraction: { status: 'ok' } })
    expect(await plan('ci-1')).toEqual({ status: 'already_done' })
    expect(deps.extract).not.toHaveBeenCalled()
    expect(await plan('ci-1', { force: true })).toMatchObject({ status: 'done' })
  })

  it('retries a failed extraction', async () => {
    const { plan } = setup({}, { wellbeing_extraction: { status: 'failed' } })
    expect(await plan('ci-1')).toMatchObject({ status: 'done' })
  })

  it('reports not_found and no_transcript', async () => {
    expect(await setup({ load: vi.fn().mockResolvedValue(null) }).plan('x')).toEqual({ status: 'not_found' })
    expect(await setup({}, { transcript: '  ' }).plan('ci-1')).toEqual({ status: 'no_transcript' })
  })

  it('records a failure on bad output, a Gemini error, a timeout and a save error', async () => {
    for (const [over, reason] of [
      [{ extract: vi.fn().mockResolvedValue({ nope: 1 }) }, 'invalid_output'],
      [{ extract: vi.fn().mockRejectedValue(new Error('429 quota')) }, '429 quota'],
      [{ extract: vi.fn().mockReturnValue(new Promise(() => {})), timeoutMs: 5 }, 'timeout'],
      [{ saveAlerts: vi.fn().mockRejectedValue(new Error('db')) }, 'could not save the alerts'],
    ] as const) {
      const { deps, plan } = setup(over as Partial<PlannerDeps>)
      expect(await plan('ci-1')).toMatchObject({ status: 'failed', reason })
      expect(deps.saveResult).toHaveBeenCalledWith('ci-1', expect.objectContaining({ status: 'failed', reason }))
      expect(deps.notify).not.toHaveBeenCalled()
    }
  })

  it('maps categories and safety to the legacy columns', () => {
    const base = { summary: 's', quote: 'q', support_needed: 'unknown', suggested_followup: null, confidence: 1 } as const
    expect(toRow({ ...base, category: 'daily_living', safety: 'urgent' })).toMatchObject({ type: 'wellbeing', severity: 'urgent', message: 's' })
    expect(toRow({ ...base, category: 'family_support', safety: 'routine' })).toMatchObject({ type: 'wants_contact', severity: 'info' })
  })
})
