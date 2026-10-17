import { useEffect, useState } from 'react'
import { registerServiceWorker } from '../firebase/notifications'

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export type UseNotificationsResult = {
  permission: NotificationPermissionState
  token: string | null
  error: Error | null
  isReady: boolean
}

export function useNotifications(): UseNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermissionState>('default')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function initialize() {
      try {
        if (typeof window === 'undefined' || typeof navigator === 'undefined') {
          if (isMounted) {
            setPermission('unsupported')
            setIsReady(true)
          }
          return
        }

        const hasServiceWorker = !!navigator.serviceWorker
        if (isMounted) setIsReady(hasServiceWorker)

        if (!hasServiceWorker) {
          if (isMounted) {
            setPermission('unsupported')
          }
          return
        }

        if (typeof Notification === 'undefined') {
          if (isMounted) {
            setPermission('unsupported')
          }
          return
        }

        const nextPermission = await Notification.requestPermission()

        if (!isMounted) return

        setPermission(nextPermission)

        if (nextPermission === 'granted') {
          const { getMessaging, getToken } = await import('firebase/messaging')
          const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

          // Tie the token to our own worker (sw.js); otherwise Firebase registers its default
          // firebase-messaging-sw.js and taps never reach our notificationclick handler.
          const serviceWorkerRegistration = (await registerServiceWorker()) ?? undefined
          const fcmToken = await getToken(getMessaging(), { vapidKey, serviceWorkerRegistration })

          if (isMounted) {
            setToken(fcmToken)
          }
        }

        if (nextPermission === 'denied') {
          console.warn('Notification permission denied; push notifications are unavailable.')
        }
      } catch (caughtError) {
        const err = caughtError instanceof Error ? caughtError : new Error(String(caughtError))
        console.error('Notification setup failed:', err)

        if (isMounted) {
          setError(err)
          setPermission('unsupported')
        }
      }
    }

    void initialize()

    return () => {
      isMounted = false
    }
  }, [])

  return { permission, token, error, isReady }
}
