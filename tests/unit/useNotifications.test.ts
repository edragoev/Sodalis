// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useNotifications } from '@/lib/hooks/useNotifications'

const mockGetToken = vi.fn()
const mockRequestPermission = vi.fn()
const mockRegister = vi.fn()

vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  getToken: (...args: unknown[]) => mockGetToken(...args),
}))

describe('useNotifications', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, NEXT_PUBLIC_FIREBASE_VAPID_KEY: 'test-vapid-key' }

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { register: mockRegister },
      configurable: true,
    })

    Object.defineProperty(globalThis, 'Notification', {
      value: { requestPermission: mockRequestPermission },
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    process.env = originalEnv
    delete (globalThis as any).Notification
    delete (globalThis as any).navigator?.serviceWorker
  })

  it('checks whether navigator.serviceWorker exists when initialized', async () => {
    const { result } = renderHook(() => useNotifications())

    await waitFor(() => {
      expect(result.current.isReady).toBeDefined()
    })

    expect(globalThis.navigator.serviceWorker).toBeDefined()
  })

  it('calls Notification.requestPermission() and handles the granted state', async () => {
    mockRequestPermission.mockResolvedValue('granted')
    mockGetToken.mockResolvedValue('fcm-token-123')

    const { result } = renderHook(() => useNotifications())

    await waitFor(() => {
      expect(result.current.token).toBe('fcm-token-123')
    })

    expect(mockRequestPermission).toHaveBeenCalledTimes(1)
    expect(result.current.permission).toBe('granted')
    expect(mockGetToken).toHaveBeenCalledWith(expect.anything(), {
      vapidKey: 'test-vapid-key',
    })
  })

  it('calls Notification.requestPermission() and handles the denied state', async () => {
    mockRequestPermission.mockResolvedValue('denied')

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useNotifications())

    await waitFor(() => {
      expect(result.current.permission).toBe('denied')
    })

    expect(mockRequestPermission).toHaveBeenCalledTimes(1)
    expect(mockGetToken).not.toHaveBeenCalled()
    expect(consoleWarnSpy).toHaveBeenCalled()
  })

  it('catches errors during setup and handles them gracefully', async () => {
    mockRequestPermission.mockRejectedValue(new Error('permission failed'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useNotifications())

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    expect(result.current.error).toBeTruthy()
    expect(result.current.permission).toBe('unsupported')
  })
})
