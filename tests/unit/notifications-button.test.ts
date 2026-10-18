// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationsButton from '@/components/NotificationsButton'

// The one place the person is asked to turn notifications on. The hook is faked, so this checks
// only what is shown and what a press does.

const enable = vi.fn()
const useNotifications = vi.fn()
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: (...args: unknown[]) => useNotifications(...args),
}))

const state = (over: Record<string, unknown> = {}) => ({
  permission: 'default',
  token: null,
  error: null,
  registered: false,
  isReady: true,
  enable,
  ...over,
})

const show = (memberId: string | null = 'm1') => render(createElement(NotificationsButton, { memberId }))

beforeEach(() => {
  vi.clearAllMocks()
  useNotifications.mockReturnValue(state())
})
afterEach(cleanup)

describe('NotificationsButton', () => {
  it('offers a button to turn notifications on, and asks only when it is pressed', () => {
    show()

    expect(enable).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /turn on notifications/i }))
    expect(enable).toHaveBeenCalledTimes(1)
  })

  it('tells the hook which member to register the token for', () => {
    show('m42')
    expect(useNotifications).toHaveBeenCalledWith(expect.objectContaining({ memberId: 'm42' }))
  })

  it('says notifications are on, with no button, once permission is granted', () => {
    useNotifications.mockReturnValue(state({ permission: 'granted', token: 'tok', registered: true }))
    show()

    expect(screen.getByText(/notifications are on/i)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('never claims notifications are on when permission is granted but nothing was registered', () => {
    useNotifications.mockReturnValue(state({ permission: 'granted' }))
    show()

    expect(screen.queryByText(/notifications are on/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /finish setting up/i }))
    expect(enable).toHaveBeenCalledTimes(1)
  })

  it('offers a retry, not "on", when registration failed', () => {
    useNotifications.mockReturnValue(state({ permission: 'granted', token: 'tok', error: new Error('x') }))
    show()

    expect(screen.queryByText(/notifications are on/i)).toBeNull()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('explains how to unblock them when the browser has them blocked, with no button', () => {
    useNotifications.mockReturnValue(state({ permission: 'denied' }))
    show()

    expect(screen.getByText(/blocked/i)).toBeTruthy()
    expect(screen.getByText(/browser settings/i)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows nothing at all in a browser that cannot do notifications', () => {
    useNotifications.mockReturnValue(state({ permission: 'unsupported' }))
    const { container } = show()
    expect(container.textContent).toBe('')
  })

  it('shows nothing until the hook has checked the browser, so there is no flash of the button', () => {
    useNotifications.mockReturnValue(state({ isReady: false }))
    const { container } = show()
    expect(container.textContent).toBe('')
  })

  it('shows an error without leaking its details', () => {
    useNotifications.mockReturnValue(state({ error: new Error('Could not save your notification settings') }))
    show()

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/couldn.t turn on notifications|try again/i)
    expect(alert.textContent).not.toContain('Could not save')
  })

  it('does not offer to turn on notifications for someone who has not linked', () => {
    show(null)
    expect(screen.queryByRole('button', { name: /turn on notifications/i })).toBeNull()
  })
})
