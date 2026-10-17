import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pushToMembers } from '@/lib/firebase/push-members'
import type { MulticastMessaging, PushOpportunity, PushSlot } from '@/lib/firebase/opportunity-push'

// Looks up members' tokens, sends the opportunity push, and clears any token Firebase reports dead.
// Supabase and Firebase are both faked.

const opportunity: PushOpportunity = {
  id: 'opp-1',
  summary: 'Has extra zucchini',
  quote: 'My zucchini are out of control.',
  mentioned_item: 'zucchini',
  urgency: 'normal',
}
const slots: PushSlot[] = [{ id: 'slot-a', starts_at: '2026-10-15T20:00:00Z' }]
const TZ = 'America/Toronto'

type Row = { fcm_token: string | null }
let rows: Row[]
let lookupError: { message: string } | null
let clearError: { message: string } | null
const lookups: { column: string; ids: string[] }[] = []
const clears: { values: unknown; tokens: string[] }[] = []

// select('fcm_token').in('id', ids) for the lookup; update(v).in('fcm_token', tokens).select('id') for cleanup.
const db = {
  from: () => ({
    select: () => ({
      in: async (column: string, ids: string[]) => {
        lookups.push({ column, ids })
        return { data: lookupError ? null : rows, error: lookupError }
      },
    }),
    update: (values: unknown) => ({
      in: (_column: string, tokens: string[]) => {
        clears.push({ values, tokens })
        return {
          select: async () => ({
            data: clearError ? null : tokens.map((_, i) => ({ id: `m${i}` })),
            error: clearError,
          }),
        }
      },
    }),
  }),
} as never

const sendEachForMulticast = vi.fn<MulticastMessaging['sendEachForMulticast']>()
const messaging = { sendEachForMulticast } as MulticastMessaging

/** FCM reply for these tokens: any token in `dead` fails with a dead-token code. */
function replyFor(dead: string[]) {
  sendEachForMulticast.mockImplementation(async (m) => ({
    successCount: m.tokens.filter((t) => !dead.includes(t)).length,
    failureCount: m.tokens.filter((t) => dead.includes(t)).length,
    responses: m.tokens.map((t) =>
      dead.includes(t)
        ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
        : { success: true },
    ),
  }))
}

const run = (memberIds = ['m1', 'm2']) => pushToMembers({ db, messaging }, memberIds, opportunity, slots, TZ)

beforeEach(() => {
  vi.clearAllMocks()
  lookups.length = 0
  clears.length = 0
  lookupError = null
  clearError = null
  rows = [{ fcm_token: 'tok-a' }, { fcm_token: 'tok-b' }]
  replyFor([])
})

describe('pushToMembers', () => {
  it('looks up the tokens of exactly the members given', async () => {
    await run(['m1', 'm2'])
    expect(lookups).toEqual([{ column: 'id', ids: ['m1', 'm2'] }])
  })

  it('sends once to every registered token', async () => {
    await run()

    expect(sendEachForMulticast).toHaveBeenCalledTimes(1)
    expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual(['tok-a', 'tok-b'])
  })

  it('skips members with no token and sends each distinct token once', async () => {
    rows = [{ fcm_token: 'tok-a' }, { fcm_token: null }, { fcm_token: 'tok-a' }, { fcm_token: '' }]

    await run()

    expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual(['tok-a'])
  })

  it('does nothing at all when no member has a token', async () => {
    rows = [{ fcm_token: null }]

    const result = await run()

    expect(sendEachForMulticast).not.toHaveBeenCalled()
    expect(clears).toEqual([])
    expect(result).toMatchObject({ successCount: 0, failureCount: 0, clearedCount: 0 })
  })

  it('does nothing when no member ids are given', async () => {
    await run([])
    expect(lookups).toEqual([])
    expect(sendEachForMulticast).not.toHaveBeenCalled()
  })

  describe('dead tokens', () => {
    it('clears only the tokens Firebase reported dead', async () => {
      replyFor(['tok-b'])

      const result = await run()

      expect(clears).toEqual([{ values: { fcm_token: null }, tokens: ['tok-b'] }])
      expect(result).toMatchObject({ successCount: 1, failureCount: 1, clearedCount: 1 })
    })

    it('leaves the database alone when every send succeeded', async () => {
      const result = await run()
      expect(clears).toEqual([])
      expect(result.clearedCount).toBe(0)
    })

    it('keeps tokens that failed for a transient reason', async () => {
      sendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [{ success: true }, { success: false, error: { code: 'messaging/internal-error' } }],
      })

      await run()

      expect(clears).toEqual([])
    })

    it('still reports the send result when cleanup itself fails', async () => {
      replyFor(['tok-b'])
      clearError = { message: 'db down' }

      const result = await run()

      expect(result).toMatchObject({ successCount: 1, failureCount: 1, clearedCount: 0, cleanupFailed: true })
    })
  })

  describe('failures', () => {
    it('throws when the token lookup fails, and sends nothing', async () => {
      lookupError = { message: 'boom' }
      await expect(run()).rejects.toThrow(/token/i)
      expect(sendEachForMulticast).not.toHaveBeenCalled()
    })

    it('lets a Firebase failure reach the caller and clears nothing', async () => {
      sendEachForMulticast.mockRejectedValue(new Error('fcm down'))
      await expect(run()).rejects.toThrow('fcm down')
      expect(clears).toEqual([])
    })
  })
})
