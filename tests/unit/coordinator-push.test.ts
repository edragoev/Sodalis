import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoordinatorPush, pushContentToMembers } from '@/lib/coordinator/push'
import type { MulticastMessaging } from '@/lib/firebase/opportunity-push'
import type { PushContent } from '@/lib/coordinator/run'

// The coordinator writes the title and body itself, so this push must send those words as they are
// (specs/08-agents/coordinator-agent.md), unlike opportunity-push.ts, which builds its own text.

const content: PushContent = {
  opportunity_id: 'opp-1',
  title: 'Grandma would love to see you',
  body: "'My zucchini are out of control.' Thu 4pm or Fri 10am?",
  urgency: 'normal',
  slot_ids: ['danny-1', 'danny-2'],
  timezone: 'America/Toronto',
}

describe('buildCoordinatorPush', () => {
  it("uses the coordinator's title and body unchanged", () => {
    const message = buildCoordinatorPush(content, 'https://carechain.example.com')
    expect(message.notification).toEqual({ title: content.title, body: content.body })
  })

  it('carries the opportunity, slots and urgency as strings, which FCM requires', () => {
    const { data } = buildCoordinatorPush(content, 'https://carechain.example.com')
    expect(data).toEqual({ opportunity_id: 'opp-1', slot_ids: 'danny-1,danny-2', urgency: 'normal' })
  })

  it('opens the opportunity page with an absolute link', () => {
    const message = buildCoordinatorPush(content, 'https://carechain.example.com')
    expect(message.webpush.fcmOptions?.link).toBe('https://carechain.example.com/opportunities/opp-1')
  })

  it('encodes an id that would otherwise change the path', () => {
    const message = buildCoordinatorPush({ ...content, opportunity_id: 'a/b?c' }, 'https://carechain.example.com')
    expect(message.webpush.fcmOptions?.link).toBe('https://carechain.example.com/opportunities/a%2Fb%3Fc')
  })

  it.each([undefined, null, '', 'http://insecure.example.com'])(
    'leaves the link out when the app url is %j (FCM rejects a relative or insecure one)',
    (appUrl) => {
      expect(buildCoordinatorPush(content, appUrl).webpush.fcmOptions).toBeUndefined()
    },
  )

  it.each([
    ['high', 'high'],
    ['normal', 'normal'],
    ['low', 'normal'],
  ] as const)('sends %s urgency with %s priority', (urgency, priority) => {
    const message = buildCoordinatorPush({ ...content, urgency }, 'https://carechain.example.com')
    expect(message.android.priority).toBe(priority)
    expect(message.webpush.headers.Urgency).toBe(priority)
  })
})

describe('pushContentToMembers', () => {
  type Row = { fcm_token: string | null }
  let rows: Row[]
  let lookupError: { message: string } | null
  const clears: { values: unknown; tokens: string[] }[] = []
  const lookups: { ids: string[] }[] = []

  const db = {
    from: () => ({
      select: () => ({
        in: async (_column: string, ids: string[]) => {
          lookups.push({ ids })
          return { data: lookupError ? null : rows, error: lookupError }
        },
      }),
      update: (values: unknown) => ({
        in: (_column: string, tokens: string[]) => {
          clears.push({ values, tokens })
          return { select: async () => ({ data: tokens.map((_, i) => ({ id: `m${i}` })), error: null }) }
        },
      }),
    }),
  } as never

  const sendEachForMulticast = vi.fn<MulticastMessaging['sendEachForMulticast']>()
  const messaging = { sendEachForMulticast } as MulticastMessaging
  const deps = { db, messaging, appUrl: 'https://carechain.example.com' }

  beforeEach(() => {
    rows = [{ fcm_token: 'tok-1' }]
    lookupError = null
    clears.length = 0
    lookups.length = 0
    sendEachForMulticast.mockReset()
    sendEachForMulticast.mockImplementation(async (m) => ({
      successCount: m.tokens.length,
      failureCount: 0,
      responses: m.tokens.map(() => ({ success: true })),
    }))
  })

  it("sends the coordinator's message to the members' tokens", async () => {
    const result = await pushContentToMembers(deps, ['danny'], content)

    expect(lookups).toEqual([{ ids: ['danny'] }])
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1)
    const sent = sendEachForMulticast.mock.calls[0][0]
    expect(sent.tokens).toEqual(['tok-1'])
    expect(sent.notification).toEqual({ title: content.title, body: content.body })
    expect(result).toMatchObject({ successCount: 1, failureCount: 0 })
  })

  it('sends one push per distinct token and skips members who have none', async () => {
    rows = [{ fcm_token: 'tok-1' }, { fcm_token: null }, { fcm_token: 'tok-1' }, { fcm_token: 'tok-2' }]
    await pushContentToMembers(deps, ['a', 'b', 'c', 'd'], content)
    expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual(['tok-1', 'tok-2'])
  })

  it('does not call FCM when nobody has a registered device', async () => {
    rows = [{ fcm_token: null }]
    expect(await pushContentToMembers(deps, ['danny'], content)).toMatchObject({ successCount: 0, failureCount: 0 })
    expect(sendEachForMulticast).not.toHaveBeenCalled()
  })

  it('does not look anything up for an empty member list', async () => {
    await pushContentToMembers(deps, [], content)
    expect(lookups).toHaveLength(0)
    expect(sendEachForMulticast).not.toHaveBeenCalled()
  })

  it('clears a token FCM says is dead, and still reports the send', async () => {
    rows = [{ fcm_token: 'tok-1' }, { fcm_token: 'tok-dead' }]
    sendEachForMulticast.mockImplementation(async (m) => ({
      successCount: 1,
      failureCount: 1,
      responses: m.tokens.map((t) =>
        t === 'tok-dead'
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true },
      ),
    }))

    const result = await pushContentToMembers(deps, ['a', 'b'], content)

    expect(clears).toEqual([{ values: { fcm_token: null }, tokens: ['tok-dead'] }])
    expect(result).toMatchObject({ successCount: 1, failureCount: 1, clearedCount: 1 })
  })

  it('throws, without leaking why, when the tokens cannot be loaded', async () => {
    lookupError = { message: 'connection refused to 10.0.0.5' }
    const err = await pushContentToMembers(deps, ['danny'], content).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toContain('10.0.0.5')
    expect(sendEachForMulticast).not.toHaveBeenCalled()
  })
})
