import { useCallback, useEffect, useRef, useState } from 'react'
import { getFirebaseApp } from '../firebase/client'
import { registerServiceWorker } from '../firebase/notifications'
import { registerToken, verifyToken } from '../push-registration'

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export type UseNotificationsOptions = {
  /** Who to register the token for. Without one the token is fetched but not registered. */
  memberId?: string | null
  register?: typeof registerToken
  verify?: typeof verifyToken
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
export function useNotifications({ memberId = null, register = registerToken, verify = verifyToken }: UseNotificationsOptions = {}): UseNotificationsResult {
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

  // Fetches this browser's FCM token and registers it for the member. If Firebase says the token
  // it handed back is dead (it caches one in the browser), drops it and starts over once.
  const fetchAndRegister = useCallback(async () => {
    const { deleteToken, getMessaging, getToken } = await import('firebase/messaging')
    // Tie the token to our own worker (sw.js); otherwise Firebase registers its default
    // firebase-messaging-sw.js and taps never reach our notificationclick handler.
    const serviceWorkerRegistration = await registerServiceWorker()
    if (!serviceWorkerRegistration) throw new Error('Service worker is not available')
    const messaging = getMessaging(getFirebaseApp())
    const options = { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, serviceWorkerRegistration }

    for (let attempt = 0; attempt < 2; attempt++) {
      const fcmToken = await getToken(messaging, options)
      if (!mounted.current) return
      setToken(fcmToken)
      setRegistered(false)

      if (!memberId) return
      const saved = await register(memberId, fcmToken)
      if (!mounted.current) return
      if (!saved.ok) {
        setError(new Error('Could not save your notification settings'))
        return
      }
      // 'unknown' (could not check) is trusted: only a clear "dead" answer triggers a fresh token.
      if ((await verify(memberId)) !== 'dead') {
        if (!mounted.current) return
        setError(null)
        setRegistered(true)
        return
      }
      if (attempt === 0) await deleteToken(messaging)
    }
    if (mounted.current) setError(new Error('Push token was rejected'))
  }, [memberId, register, verify])

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
