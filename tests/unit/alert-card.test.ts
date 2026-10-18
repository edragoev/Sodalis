// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlertCard, { type Alert } from '@/components/AlertCard'

// The X on an alert: it calls the dismiss route for this member, and the parent removes the card.

const alert: Alert = {
  id: 'a1',
  type: 'health',
  severity: 'urgent',
  message: 'fell this morning, hip hurts',
  created_at: '2026-10-18T07:03:00Z',
  check_in_id: 'c1',
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const show = (onDismissed = vi.fn(), prominent = true) => {
  render(createElement(AlertCard, { alert, memberId: 'm1', time: 'Today, 3:03 AM', prominent, onDismissed }))
  return onDismissed
}

describe('AlertCard', () => {
  it('dismisses the alert for this member and tells the parent', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    const onDismissed = show()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss alert' }))

    await waitFor(() => expect(onDismissed).toHaveBeenCalledWith('a1'))
    expect(fetchMock).toHaveBeenCalledWith('/api/alerts/a1/dismiss', expect.objectContaining({ method: 'POST', body: JSON.stringify({ member_id: 'm1' }) }))
  })

  it('keeps the alert and says so when dismissing fails', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }))
    const onDismissed = show()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss alert' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onDismissed).not.toHaveBeenCalled()
    expect(screen.getByText('fell this morning, hip hurts')).toBeTruthy()
  })

  it('has an X on the compact card too', () => {
    show(vi.fn(), false)
    expect(screen.getByRole('button', { name: 'Dismiss alert' })).toBeTruthy()
    expect(screen.queryByText('Read the call')).toBeNull()
  })
})
