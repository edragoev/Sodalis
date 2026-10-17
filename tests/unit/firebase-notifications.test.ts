import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getFirebaseMessaging,
  registerFirebaseServiceWorker,
  requestFirebaseNotificationPermission,
} from '@/lib/firebase/notifications'

describe('firebase notifications', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).Notification
    delete (globalThis as any).navigator?.serviceWorker
  })

  it('registers the single app service worker (sw.js), which also handles push', async () => {
    const register = vi.fn().mockResolvedValue({ scope: '/' })
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    })

    const result = await registerFirebaseServiceWorker()

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
    expect(result).toEqual({ scope: '/' })
  })

  it('returns null when the browser does not support service worker registration', async () => {
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
    })

    await expect(registerFirebaseServiceWorker()).resolves.toBeNull()
  })

  it('requests notification permission and resolves when granted', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    Object.defineProperty(globalThis, 'Notification', {
      value: { requestPermission },
      configurable: true,
      writable: true,
    })

    await expect(requestFirebaseNotificationPermission()).resolves.toBe('granted')
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('returns the registered messaging instance when supported', () => {
    const messaging = { getToken: vi.fn() }
    const getMessaging = vi.fn(() => messaging)

    const result = getFirebaseMessaging({
      getMessaging,
      vapidKey: 'test-vapid-key',
    })

    expect(getMessaging).toHaveBeenCalledWith({ vapidKey: 'test-vapid-key' })
    expect(result).toBe(messaging)
  })
})
