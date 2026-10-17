// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useNotifications } from '@/lib/hooks/useNotifications'

// The hook never prompts by itself: browsers penalize permission requests on page load. It reads
// the current permission on mount (and quietly fetches a token if already granted); asking
// happens only when the caller runs enable(), from a button press.

const mockGetToken = vi.fn()
const mockGetMessaging = vi.fn()
const mockRequestPermission = vi.fn()
const mockRegisterSw = vi.fn()
const register = vi.fn()
const APP = { name: 'test-app' }
const REGISTRATION = { scope: '/', active: { scriptURL: '/sw.js' } }

vi.mock('firebase/messaging', () => ({
  getMessaging: (...args: unknown[]) => mockGetMessaging(...args),
  getToken: (...args: unknown[]) => mockGetToken(...args),
}))
vi.mock('@/lib/firebase/client', () => ({ getFirebaseApp: () => APP }))

function stubNotification(permission: NotificationPermission) {
  Object.defineProperty(globalThis, 'Notification', {
    value: { permission, requestPermission: mockRequestPermission },
    configurable: true,
    writable: true,
  })
}

describe('useNotifications', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, NEXT_PUBLIC_FIREBASE_VAPID_KEY: 'test-vapid-key' }

    mockGetMessaging.mockReturnValue({ messaging: true })
    mockGetToken.mockResolvedValue('fcm-token-123')
    mockRegisterSw.mockResolvedValue(REGISTRATION)
    register.mockResolvedValue({ ok: true })

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { register: mockRegisterSw },
      configurable: true,
    })
    stubNotification('default')
  })

  afterEach(() => {
    process.env = originalEnv
    delete (globalThis as any).Notification
    delete (globalThis as any).navigator?.serviceWorker
    vi.restoreAllMocks()
  })

  const setup = (options: Parameters<typeof useNotifications>[0] = { memberId: 'm1', register }) =>
    renderHook(() => useNotifications(options))

  const enable = (result: { current: ReturnType<typeof useNotifications> }) =>
    act(async () => {
      await result.current.enable()
    })

  it('checks whether navigator.serviceWorker exists when initialized', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.isReady).toBeDefined())
    expect(globalThis.navigator.serviceWorker).toBeDefined()
  })

  describe('on mount', () => {
    it('does not ask for permission, and reports "default"', async () => {
      const { result } = setup()
      await waitFor(() => expect(result.current.isReady).toBe(true))

      expect(mockRequestPermission).not.toHaveBeenCalled()
      expect(mockGetToken).not.toHaveBeenCalled()
      expect(result.current.permission).toBe('default')
      expect(result.current.token).toBeNull()
    })

    it('quietly gets a token and registers it when permission was already granted', async () => {
      stubNotification('granted')
      const { result } = setup()

      await waitFor(() => expect(result.current.token).toBe('fcm-token-123'))

      expect(mockRequestPermission).not.toHaveBeenCalled()
      expect(result.current.permission).toBe('granted')
      expect(register).toHaveBeenCalledWith('m1', 'fcm-token-123')
    })

    it('reports "denied" without asking again or fetching a token', async () => {
      stubNotification('denied')
      const { result } = setup()

      await waitFor(() => expect(result.current.permission).toBe('denied'))

      expect(mockRequestPermission).not.toHaveBeenCalled()
      expect(mockGetToken).not.toHaveBeenCalled()
      expect(register).not.toHaveBeenCalled()
    })

    it('reports "unsupported" when the browser has no Notification API', async () => {
      delete (globalThis as any).Notification
      const { result } = setup()
      await waitFor(() => expect(result.current.permission).toBe('unsupported'))
    })

    it('reports "unsupported" when the browser has no service worker support', async () => {
      Object.defineProperty(globalThis.navigator, 'serviceWorker', { value: undefined, configurable: true })
      const { result } = setup()
      await waitFor(() => expect(result.current.permission).toBe('unsupported'))
    })
  })

  describe('enable()', () => {
    it('asks for permission, then gets a token tied to the app\'s own worker and registers it', async () => {
      mockRequestPermission.mockResolvedValue('granted')
      const { result } = setup()
      await waitFor(() => expect(result.current.isReady).toBe(true))

      await enable(result)

      expect(mockRequestPermission).toHaveBeenCalledTimes(1)
      expect(mockGetMessaging).toHaveBeenCalledWith(APP) // the Firebase app, not an implicit default
      expect(mockGetToken).toHaveBeenCalledWith(
        { messaging: true },
        { vapidKey: 'test-vapid-key', serviceWorkerRegistration: REGISTRATION },
      )
      expect(result.current.permission).toBe('granted')
      expect(result.current.token).toBe('fcm-token-123')
      expect(register).toHaveBeenCalledWith('m1', 'fcm-token-123')
    })

    it('stops at "denied" without fetching or registering a token', async () => {
      mockRequestPermission.mockResolvedValue('denied')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { result } = setup()
      await waitFor(() => expect(result.current.isReady).toBe(true))

      await enable(result)

      expect(result.current.permission).toBe('denied')
      expect(mockGetToken).not.toHaveBeenCalled()
      expect(register).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalled()
    })

    it('asks only once if it is called twice in a row', async () => {
      let answer!: (p: string) => void
      mockRequestPermission.mockReturnValue(new Promise((resolve) => (answer = resolve)))
      const { result } = setup()
      await waitFor(() => expect(result.current.isReady).toBe(true))

      await act(async () => {
        void result.current.enable()
        void result.current.enable()
        answer('granted')
      })

      expect(mockRequestPermission).toHaveBeenCalledTimes(1)
    })

    it('still gets a token when nobody is linked, but has nobody to register it for', async () => {
      mockRequestPermission.mockResolvedValue('granted')
      const { result } = setup({ memberId: null, register })
      await waitFor(() => expect(result.current.isReady).toBe(true))

      await enable(result)

      expect(result.current.token).toBe('fcm-token-123')
      expect(register).not.toHaveBeenCalled()
    })

    it('reports an error, but keeps the token, when the server could not save it', async () => {
      mockRequestPermission.mockResolvedValue('granted')
      register.mockResolvedValue({ ok: false })
      const { result } = setup()
      await waitFor(() => expect(result.current.isReady).toBe(true))

      await enable(result)

      expect(result.current.error?.message).toMatch(/save/i)
      expect(result.current.token).toBe('fcm-token-123')
    })

    it('catches errors during setup and handles them gracefully', async () => {
      mockRequestPermission.mockRejectedValue(new Error('permission failed'))
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { result } = setup()
      await waitFor(() => expect(result.current.isReady).toBe(true))

      await enable(result)

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(result.current.error).toBeTruthy()
      expect(result.current.permission).toBe('unsupported')
    })

    it('does nothing in a browser without notification support', async () => {
      delete (globalThis as any).Notification
      const { result } = setup()
      await waitFor(() => expect(result.current.permission).toBe('unsupported'))

      await enable(result)

      expect(mockGetToken).not.toHaveBeenCalled()
      expect(register).not.toHaveBeenCalled()
    })
  })
})
