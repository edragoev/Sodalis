import { getMessaging as getFirebaseMessagingInstance } from 'firebase/messaging'
import { getFirebaseApp } from './client'
import { getFirebaseVapidKey } from './config'

export type FirebaseMessagingOptions = {
  vapidKey?: string
}

export type MessagingFactory = (options: FirebaseMessagingOptions) => unknown

/**
 * Build the Firebase Messaging instance for the browser. This accepts a custom factory
 * primarily for testability and falls back to the real firebase/messaging implementation.
 */
export function getFirebaseMessaging(
  options: { getMessaging?: MessagingFactory; vapidKey?: string } = {},
): unknown {
  const vapidKey = options.vapidKey ?? getFirebaseVapidKey()
  const factory =
    options.getMessaging ??
    ((_: FirebaseMessagingOptions) => {
      if (typeof window === 'undefined') return null
      return getFirebaseMessagingInstance(getFirebaseApp())
    })

  return factory({ vapidKey })
}

/**
 * Register the app's service worker (sw.js), which also handles push, and wait until it is active.
 * Registering the same worker twice is safe and returns the existing registration.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof globalThis.navigator === 'undefined' || !globalThis.navigator.serviceWorker) return null

  try {
    const { serviceWorker } = globalThis.navigator
    const registration = await serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    // On a first visit the worker is still installing, and a push token cannot be fetched until it is
    // active ("no active Service Worker"), so wait for it. `ready` resolves with the active registration.
    return registration.active || !serviceWorker.ready ? registration : await serviceWorker.ready
  } catch {
    return null
  }
}

/**
 * Request browser push permission for this origin.
 */
export async function requestFirebaseNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof globalThis === 'undefined' || typeof globalThis.Notification === 'undefined') return null
  return globalThis.Notification.requestPermission()
}
