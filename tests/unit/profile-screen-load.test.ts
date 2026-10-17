// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProfileScreen from '@/components/ProfileScreen'

// The saved session can point at a member that no longer exists (for example after the app is pointed at a
// different database). The screen must recover instead of crashing on a response with no profile in it.

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))

const SESSION_KEY = 'sodalis.session'

function respondWith(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ member_id: 'gone', senior_id: 's1', name: 'Riley' }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProfileScreen loading', () => {
  it('sends the person back to the start, and forgets the session, when their profile no longer exists', async () => {
    respondWith(404, { error: 'Member not found' })

    render(createElement(ProfileScreen))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('shows a message, and keeps the session, when the profile cannot be loaded for another reason', async () => {
    respondWith(500, { error: 'Something broke' })

    render(createElement(ProfileScreen))

    expect(await screen.findByText(/couldn't load your profile/i)).toBeTruthy()
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('shows a message when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(createElement(ProfileScreen))

    expect(await screen.findByText(/couldn't load your profile/i)).toBeTruthy()
  })
})
