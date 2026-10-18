import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { buildAlertPush, pushAlertToFamily } from '@/lib/firebase/alert-push'
import type { MulticastMessaging } from '@/lib/firebase/opportunity-push'

// The urgent push for a concern Soladis flagged during a call (specs/08-agents/hope-tools.md).

const content = { seniorName: 'Jane', seniorPhone: '+14155550142', detail: "fell, can't get up." }

describe('buildAlertPush', () => {
  it("says who may need help, what they said, and that Soladis suggested 911", () => {
    expect(buildAlertPush(content).notification).toEqual({
      title: 'Jane may need help',
      body: `"fell, can't get up." Soladis suggested calling 911. Tap to call Jane.`,
    })
  })

  it('never guesses pronouns', () => {
    const { body } = buildAlertPush(content).notification
    expect(body).not.toMatch(/\b(she|he|her|his|him)\b/i)
  })

  it('carries the elder phone for the tap, as strings (FCM requires them)', () => {
    expect(buildAlertPush(content).data).toEqual({ type: 'alert', urgency: 'high', elder_phone: '+14155550142' })
  })

  it('is high priority on Android and the web', () => {
    const message = buildAlertPush(content, 'https://carechain.example.com')
    expect(message.android.priority).toBe('high')
    expect(message.webpush.headers.Urgency).toBe('high')
    expect(message.webpush.fcmOptions?.link).toBe('https://carechain.example.com/')
  })
})

describe('pushAlertToFamily', () => {
  function fakeDb(rows: { fcm_token: string | null }[], error: unknown = null) {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ data: rows, error }),
      update: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    }
    return { db: { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient, query }
  }

  const messaging = (responses: { success: boolean; error?: { code: string } }[]) =>
    ({
      sendEachForMulticast: vi.fn().mockResolvedValue({
        successCount: responses.filter((r) => r.success).length,
        failureCount: responses.filter((r) => !r.success).length,
        responses,
      }),
    }) satisfies MulticastMessaging

  it("sends one push to every family member's device", async () => {
    const { db, query } = fakeDb([{ fcm_token: 'sarah' }, { fcm_token: 'tom' }, { fcm_token: 'sarah' }])
    const m = messaging([{ success: true }, { success: true }])

    const result = await pushAlertToFamily({ db, messaging: m }, 'senior-1', content)

    expect(query.eq).toHaveBeenCalledWith('senior_id', 'senior-1')
    expect(m.sendEachForMulticast).toHaveBeenCalledTimes(1)
    expect(m.sendEachForMulticast.mock.calls[0][0].tokens).toEqual(['sarah', 'tom'])
    expect(result.successCount).toBe(2)
  })

  it('sends nothing when nobody has notifications on', async () => {
    const { db } = fakeDb([])
    const m = messaging([])
    const result = await pushAlertToFamily({ db, messaging: m }, 'senior-1', content)
    expect(m.sendEachForMulticast).not.toHaveBeenCalled()
    expect(result.successCount).toBe(0)
  })

  it('fails without quoting the database error, which could contain a token', async () => {
    const { db } = fakeDb([], { message: 'token abc123 is bad' })
    await expect(pushAlertToFamily({ db, messaging: messaging([]) }, 'senior-1', content)).rejects.toThrow(
      'Could not load push tokens',
    )
  })
})
