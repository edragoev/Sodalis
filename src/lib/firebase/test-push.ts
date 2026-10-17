// The "hello world" push behind POST /api/push/test.

/** The slice of firebase-admin's Messaging that a single-token send needs. */
export type TokenMessaging = {
  send(message: TestPushMessage): Promise<string>
}

export type TestPushMessage = {
  token: string
  notification: { title: string; body: string }
  data: Record<string, string>
  android: { priority: 'normal' }
  webpush: { headers: { Urgency: 'normal' }; fcmOptions: { link: string } }
}

export { isDeadTokenError } from './dead-token'

export function buildTestPush(token: string, memberName?: string | null): TestPushMessage {
  const firstName = memberName?.trim().split(/\s+/)[0]
  return {
    token,
    notification: {
      title: 'CareChain test',
      body: firstName
        ? `Hi ${firstName}, notifications are working.`
        : 'Notifications are working.',
    },
    data: { type: 'test' },
    android: { priority: 'normal' },
    webpush: { headers: { Urgency: 'normal' }, fcmOptions: { link: '/' } },
  }
}

export async function sendTestPush(messaging: TokenMessaging, token: string, memberName?: string | null) {
  if (token.trim() === '') throw new Error('A token is required to send a push')
  const messageId = await messaging.send(buildTestPush(token, memberName))
  return { messageId }
}
