import { describe, expect, it, vi } from 'vitest'
import {
  buildOpportunityPush,
  formatSlot,
  sendOpportunityPush,
  type MulticastMessaging,
  type PushOpportunity,
  type PushSlot,
} from '@/lib/firebase/opportunity-push'

const TZ = 'America/Toronto'

// The worked example in the spec: Danny and the zucchini, three slots within 3 days.
const opportunity: PushOpportunity = {
  id: 'opp-1',
  summary: 'The elder has more zucchini than they can use.',
  quote: 'My zucchini are out of control this year.',
  mentioned_item: 'zucchini',
  urgency: 'normal',
}
// 2026-10-15 is a Thursday. 20:00Z is 4pm in Toronto (EDT, UTC-4).
const slots: PushSlot[] = [
  { id: 'slot-a', starts_at: '2026-10-15T20:00:00Z' },
  { id: 'slot-b', starts_at: '2026-10-16T14:00:00Z' },
  { id: 'slot-c', starts_at: '2026-10-17T18:00:00Z' },
]

function fakeMessaging() {
  const sendEachForMulticast = vi.fn<MulticastMessaging['sendEachForMulticast']>()
  sendEachForMulticast.mockImplementation(async (m) => ({
    successCount: m.tokens.length,
    failureCount: 0,
    responses: m.tokens.map(() => ({ success: true })),
  }))
  return { messaging: { sendEachForMulticast } as MulticastMessaging, sendEachForMulticast }
}

describe('formatSlot', () => {
  it('formats weekday and hour in the given timezone', () => {
    expect(formatSlot('2026-10-15T20:00:00Z', TZ)).toBe('Thu 4pm')
    expect(formatSlot('2026-10-16T14:00:00Z', TZ)).toBe('Fri 10am')
  })

  it('keeps minutes only when they are not zero', () => {
    expect(formatSlot('2026-10-15T20:30:00Z', TZ)).toBe('Thu 4:30pm')
  })

  it('renders midnight and noon as 12am and 12pm', () => {
    expect(formatSlot('2026-10-15T04:00:00Z', TZ)).toBe('Thu 12am')
    expect(formatSlot('2026-10-15T16:00:00Z', TZ)).toBe('Thu 12pm')
  })

  it('throws a RangeError for an invalid date', () => {
    expect(() => formatSlot('not-a-date', TZ)).toThrow(RangeError)
  })

  it('uses the timezone, not the machine clock', () => {
    // Same instant, different local day: 02:00Z Friday is still Thursday evening in Toronto.
    expect(formatSlot('2026-10-16T02:00:00Z', TZ)).toBe('Thu 10pm')
    expect(formatSlot('2026-10-16T02:00:00Z', 'UTC')).toBe('Fri 2am')
  })
})

describe('buildOpportunityPush', () => {
  it('writes a warm title and a body with the quote and slots', () => {
    const { notification } = buildOpportunityPush(opportunity, slots, TZ)
    expect(notification.title).toBe('A visit idea: zucchini')
    expect(notification.body).toBe("'My zucchini are out of control this year.' Thu 4pm, Fri 10am, Sat 2pm")
  })

  it('falls back to the summary when no item was mentioned', () => {
    const { notification } = buildOpportunityPush({ ...opportunity, mentioned_item: null }, slots, TZ)
    expect(notification.title).toBe(`A visit idea: ${opportunity.summary}`)
  })

  it('omits the quote cleanly when there is none', () => {
    const { notification } = buildOpportunityPush({ ...opportunity, quote: null }, slots, TZ)
    expect(notification.body).toBe('Thu 4pm, Fri 10am, Sat 2pm')
  })

  it('shortens a long quote so detail stays on the dashboard', () => {
    const long = 'I have been feeling dizzy and my chest hurts when I climb the stairs lately, doctor says rest.'
    const { notification } = buildOpportunityPush({ ...opportunity, quote: long }, slots, TZ)
    const quoted = notification.body.match(/^'(.*)' /)![1]
    expect(quoted.length).toBeLessThanOrEqual(80)
    expect(quoted.endsWith('…')).toBe(true)
  })

  it('treats a blank mentioned_item as missing', () => {
    const { notification } = buildOpportunityPush({ ...opportunity, mentioned_item: '   ' }, slots, TZ)
    expect(notification.title).toBe(`A visit idea: ${opportunity.summary}`)
  })

  it('never splits an emoji when shortening a quote', () => {
    const quote = '🥒'.repeat(100)
    const { notification } = buildOpportunityPush({ ...opportunity, quote, mentioned_item: null }, [], TZ)
    expect(notification.body).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it('never produces an empty body when there are no slots', () => {
    expect(buildOpportunityPush(opportunity, [], TZ).notification.body).toContain('zucchini')
    const bare = buildOpportunityPush({ ...opportunity, quote: null }, [], TZ)
    expect(bare.notification.body).toBe(opportunity.summary)
    expect(bare.data.slot_ids).toBe('')
  })

  it('skips slots with an invalid date instead of failing the whole push', () => {
    const bad = [...slots, { id: 'slot-bad', starts_at: 'garbage' }]
    const m = buildOpportunityPush(opportunity, bad, TZ)
    expect(m.notification.body).toBe("'My zucchini are out of control this year.' Thu 4pm, Fri 10am, Sat 2pm")
    expect(m.data.slot_ids).toBe('slot-a,slot-b,slot-c')
  })

  it('puts opportunity_id, slot ids and urgency in data, all as strings', () => {
    const { data } = buildOpportunityPush(opportunity, slots, TZ)
    expect(data).toEqual({ opportunity_id: 'opp-1', slot_ids: 'slot-a,slot-b,slot-c', urgency: 'normal' })
    expect(Object.values(data).every((v) => typeof v === 'string')).toBe(true)
  })

  it('opens /opportunities/[id] when tapped', () => {
    expect(buildOpportunityPush(opportunity, slots, TZ).webpush.fcmOptions.link).toBe('/opportunities/opp-1')
  })

  it('maps high urgency to high FCM priority and everything else to normal', () => {
    const priorityOf = (urgency: PushOpportunity['urgency']) => {
      const m = buildOpportunityPush({ ...opportunity, urgency }, slots, TZ)
      return [m.android.priority, m.webpush.headers.Urgency]
    }
    expect(priorityOf('high')).toEqual(['high', 'high'])
    expect(priorityOf('normal')).toEqual(['normal', 'normal'])
    expect(priorityOf('low')).toEqual(['normal', 'normal'])
  })
})

describe('sendOpportunityPush', () => {
  it('calls sendEachForMulticast once with the built message and the tokens', async () => {
    const { messaging, sendEachForMulticast } = fakeMessaging()

    const result = await sendOpportunityPush(messaging, ['tok-danny', 'tok-maya'], opportunity, slots, TZ)

    expect(sendEachForMulticast).toHaveBeenCalledTimes(1)
    expect(sendEachForMulticast).toHaveBeenCalledWith({
      ...buildOpportunityPush(opportunity, slots, TZ),
      tokens: ['tok-danny', 'tok-maya'],
    })
    expect(result).toEqual({ successCount: 2, failureCount: 0, invalidTokens: [] })
  })

  it('sends high priority for a high urgency opportunity', async () => {
    const { messaging, sendEachForMulticast } = fakeMessaging()
    await sendOpportunityPush(messaging, ['tok'], { ...opportunity, urgency: 'high' }, slots, TZ)
    expect(sendEachForMulticast.mock.calls[0][0].android.priority).toBe('high')
  })

  it('does not call Firebase when nobody has a token', async () => {
    const { messaging, sendEachForMulticast } = fakeMessaging()
    const result = await sendOpportunityPush(messaging, [], opportunity, slots, TZ)
    expect(sendEachForMulticast).not.toHaveBeenCalled()
    expect(result).toEqual({ successCount: 0, failureCount: 0, invalidTokens: [] })
  })

  it('splits more than 500 tokens into batches and adds up the counts', async () => {
    const { messaging, sendEachForMulticast } = fakeMessaging()
    const tokens = Array.from({ length: 1201 }, (_, i) => `tok-${i}`)

    const result = await sendOpportunityPush(messaging, tokens, opportunity, slots, TZ)

    expect(sendEachForMulticast.mock.calls.map(([m]) => m.tokens.length)).toEqual([500, 500, 201])
    expect(result.successCount).toBe(1201)
  })

  it('reports tokens FCM says are dead so the caller can delete them', async () => {
    const { messaging, sendEachForMulticast } = fakeMessaging()
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 3,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/invalid-registration-token' } },
        { success: false, error: { code: 'messaging/internal-error' } }, // transient: keep the token
      ],
    })

    const result = await sendOpportunityPush(messaging, ['a', 'b', 'c', 'd'], opportunity, slots, TZ)

    expect(result.failureCount).toBe(3)
    expect(result.invalidTokens).toEqual(['b', 'c'])
  })

  it('lets a Firebase failure reach the caller', async () => {
    const { messaging, sendEachForMulticast } = fakeMessaging()
    sendEachForMulticast.mockRejectedValue(new Error('fcm down'))
    await expect(sendOpportunityPush(messaging, ['tok'], opportunity, slots, TZ)).rejects.toThrow('fcm down')
  })
})
