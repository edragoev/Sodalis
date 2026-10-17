import { absoluteUrl } from '@/lib/app-url'

export type PushPriority = 'high' | 'normal'

/** The parts of an FCM message every push of ours has, before it is addressed to anyone. */
export type PushMessageBody<P extends PushPriority = PushPriority> = {
  notification: { title: string; body: string }
  data: Record<string, string>
  android: { priority: P }
  webpush: { headers: { Urgency: P }; fcmOptions?: { link: string } }
}

/**
 * The delivery settings for a push: its priority on Android and the web, and where a tap goes.
 * FCM rejects a relative click link, so the link is left out when the app URL is unknown; taps
 * still work because the service worker routes from the message data.
 */
export function deliveryOptions<P extends PushPriority>(
  priority: P,
  appUrl: string | null | undefined,
  path: string,
): Pick<PushMessageBody<P>, 'android' | 'webpush'> {
  const link = absoluteUrl(appUrl, path)
  return {
    android: { priority },
    webpush: { headers: { Urgency: priority }, ...(link ? { fcmOptions: { link } } : {}) },
  }
}
