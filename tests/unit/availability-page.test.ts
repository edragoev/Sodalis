// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Availability from '@/components/Availability'

// The Availability page is only the member's calendar: suggested times are 9am-8pm when it is free,
// so there is no grid of free times to fill in.

const router = { push: vi.fn(), replace: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/availability' }))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('sodalis.session', JSON.stringify({ member_id: 'm1', senior_id: 's1', name: 'Anna' }))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ events: [] }), { status: 200 })))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Availability page', () => {
  it('shows the calendar upload and explains the 9am-8pm rule', async () => {
    render(createElement(Availability))
    expect(await screen.findByRole('heading', { name: "When you're free" })).toBeTruthy()
    expect(screen.getByText(/between 9am and 8pm when you're not busy/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Your calendar' })).toBeTruthy()
  })

  it('has no grid of free times and nothing to save', async () => {
    render(createElement(Availability))
    await screen.findByRole('heading', { name: "When you're free" })
    expect(screen.queryByRole('group', { name: /weekly availability/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /save my times/i })).toBeNull()
  })

  it('sends a signed-out visitor to the start', () => {
    localStorage.clear()
    render(createElement(Availability))
    expect(router.replace).toHaveBeenCalledWith('/')
  })
})
