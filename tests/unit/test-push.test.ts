import { describe, expect, it, vi } from 'vitest'
import {
  buildTestPush,
  isDeadTokenError,
  sendTestPush,
  type TokenMessaging,
} from '@/lib/firebase/test-push'

// The "hello world" push behind POST /api/push/test. Messaging is a fake, so no Firebase is needed.

function fakeMessaging() {
  const send = vi.fn<TokenMessaging['send']>()
  send.mockResolvedValue('projects/p/messages/123')
  return { messaging: { send } as TokenMessaging, send }
}

describe('buildTestPush', () => {
  it('addresses one token with a short, friendly notification', () => {
    const message = buildTestPush('tok-1')
    expect(message.token).toBe('tok-1')
    expect(message.notification.title).toMatch(/\S/)
    expect(message.notification.body).toMatch(/\S/)
  })

  it('marks itself as a test', () => {
    expect(buildTestPush('tok-1').data).toEqual({ type: 'test' })
  })

  describe('click link (FCM requires an absolute HTTPS URL)', () => {
    it('opens the dashboard on the app\'s origin', () => {
      expect(buildTestPush('tok-1', null, 'https://app.example.com').webpush.fcmOptions?.link).toBe(
        'https://app.example.com/',
      )
    })

    it.each([undefined, null, '', 'http://localhost:3000', '/relative'])(
      'leaves fcmOptions out entirely for %j',
      (appUrl) => {
        expect(buildTestPush('tok-1', null, appUrl as never).webpush).not.toHaveProperty('fcmOptions')
      },
    )
  })

  it('uses normal priority, since a test is never urgent', () => {
    const message = buildTestPush('tok-1')
    expect(message.android.priority).toBe('normal')
    expect(message.webpush.headers.Urgency).toBe('normal')
  })

  it('greets the member by first name when given one', () => {
    expect(buildTestPush('tok-1', 'Danny Smith').notification.body).toContain('Danny')
    expect(buildTestPush('tok-1', 'Danny Smith').notification.body).not.toContain('Smith')
  })

  it('works without a name', () => {
    expect(buildTestPush('tok-1', null).notification.body).not.toMatch(/undefined|null/)
  })
})

describe('sendTestPush', () => {
  it('calls messaging.send once with the built message', async () => {
    const { messaging, send } = fakeMessaging()

    await sendTestPush(messaging, 'tok-1', 'Danny')

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(buildTestPush('tok-1', 'Danny'))
  })

  it('passes the app URL through to the message', async () => {
    const { messaging, send } = fakeMessaging()
    await sendTestPush(messaging, 'tok-1', 'Danny', 'https://app.example.com')
    expect(send).toHaveBeenCalledWith(buildTestPush('tok-1', 'Danny', 'https://app.example.com'))
  })

  it('returns the message id Firebase gave back', async () => {
    const { messaging } = fakeMessaging()
    await expect(sendTestPush(messaging, 'tok-1')).resolves.toEqual({ messageId: 'projects/p/messages/123' })
  })

  it('lets a Firebase failure reach the caller', async () => {
    const { messaging, send } = fakeMessaging()
    send.mockRejectedValue(new Error('fcm down'))
    await expect(sendTestPush(messaging, 'tok-1')).rejects.toThrow('fcm down')
  })

  it('refuses to send with an empty token, without calling Firebase', async () => {
    const { messaging, send } = fakeMessaging()
    await expect(sendTestPush(messaging, '   ')).rejects.toThrow(/token/i)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('isDeadTokenError', () => {
  it.each(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'])(
    'treats %s as a token that will never work again',
    (code) => {
      expect(isDeadTokenError({ code })).toBe(true)
    },
  )

  it.each([{ code: 'messaging/internal-error' }, { code: 'messaging/server-unavailable' }, new Error('x'), null, 'oops'])(
    'keeps the token for other errors (%j)',
    (error) => {
      expect(isDeadTokenError(error)).toBe(false)
    },
  )
})
