import { useCallback, useEffect, useRef, useState } from 'react'
import { getFirebaseApp } from '../firebase/client'
import { registerServiceWorker } from '../firebase/notifications'
import { registerToken } from '../push-registration'

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export type UseNotificationsOptions = {
  /** Who to register the token for. Without one the token is fetched but not registered. */
  memberId?: string | null
  register?: typeof registerToken
}

export type UseNotificationsResult = {
  permission: NotificationPermissionState
  token: string | null
  error: Error | null
  /** True only once a push token exists AND the server confirmed it saved it for the member. */
  registered: boolean
  isReady: boolean
  /** Asks for permission (call it from a button press), then fetches and registers the token. */
  enable: () => Promise<void>
}

const supported = () =>
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !!navigator.serviceWorker &&
  typeof Notification !== 'undefined'

const asError = (caught: unknown) => (caught instanceof Error ? caught : new Error(String(caught)))

/**
 * Browser push state. It never prompts by itself, because browsers penalize permission requests
 * on page load: on mount it only reads the current permission (and quietly fetches a token if
 * it was already granted). Asking happens in enable().
 */
export function useNotifications({ memberId = null, register = registerToken }: UseNotificationsOptions = {}): UseNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermissionState>('default')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [registered, setRegistered] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const mounted = useRef(true)
  const asking = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Fetches this browser's FCM token and registers it for the member.
  const fetchAndRegister = useCallback(async () => {
    const { getMessaging, getToken } = await import('firebase/messaging')
    // Tie the token to our own worker (sw.js); otherwise Firebase registers its default
    // firebase-messaging-sw.js and taps never reach our notificationclick handler.
    const serviceWorkerRegistration = await registerServiceWorker()
    if (!serviceWorkerRegistration) throw new Error('Service worker is not available')
    const fcmToken = await getToken(getMessaging(getFirebaseApp()), {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration,
    })
    if (!mounted.current) return
    setToken(fcmToken)
    setRegistered(false)

    if (!memberId) return
    const saved = await register(memberId, fcmToken)
    if (!mounted.current) return
    if (saved.ok) {
      setError(null)
      setRegistered(true)
    } else {
      setError(new Error('Could not save your notification settings'))
    }
  }, [memberId, register])

  useEffect(() => {
    async function check() {
      if (!supported()) {
        setPermission('unsupported')
        setIsReady(true)
        return
      }
      setPermission(Notification.permission as NotificationPermissionState)
      try {
        if (Notification.permission === 'granted') await fetchAndRegister()
      } catch (caught) {
        console.error('Notification setup failed:', caught)
        if (mounted.current) setError(asError(caught))
      }
      if (mounted.current) setIsReady(true)
    }
    void check()
  }, [fetchAndRegister])

  const enable = useCallback(async () => {
    if (!supported() || asking.current) return
    asking.current = true
    try {
      const answer = (await Notification.requestPermission()) as NotificationPermissionState
      if (!mounted.current) return
      setPermission(answer)
      if (answer === 'granted') await fetchAndRegister()
      else if (answer === 'denied') {
        console.warn('Notification permission denied; push notifications are unavailable.')
      }
    } catch (caught) {
      console.error('Notification setup failed:', caught)
      if (mounted.current) {
        setError(asError(caught))
        setPermission('unsupported')
      }
    } finally {
      asking.current = false
    }
  }, [fetchAndRegister])

  return { permission, token, error, registered, isReady, enable }
}
