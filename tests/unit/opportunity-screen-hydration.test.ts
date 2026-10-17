// @vitest-environment jsdom
import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OpportunityScreen from '@/components/OpportunityScreen'
import type { OpportunityData } from '@/lib/opportunity-view'

// The screen must not decide what to show from localStorage while it renders: the server has no
// localStorage, so the server HTML and the browser's first render would disagree (a hydration
// mismatch, and a flash of "Link your account" for everyone). It reads the session in an effect.

const SESSION = { member_id: 'm1', senior_id: 'senior-1' }
const KEY = 'sodalis.session'

const data: OpportunityData = {
  opportunity: {
    id: 'opp-1',
    senior_id: 'senior-1',
    type: 'gift_errand',
    summary: 'Has extra zucchini',
    quote: 'My zucchini are out of control.',
    mentioned_item: 'zucchini',
    urgency: 'normal',
    status: 'proposed',
    accepted_by: null,
    proposed_slots: [{ id: 'slot-a', starts_at: '2026-10-15T20:00:00Z' }],
  },
  members: [{ id: 'm1', name: 'Danny' }],
  timezone: 'America/Toronto',
}

const load = vi.fn()
const element = () => createElement(OpportunityScreen, { opportunityId: 'opp-1', load })

beforeEach(() => {
  vi.clearAllMocks()
  load.mockResolvedValue(data)
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

/** What the server renders: there is no localStorage there. */
function serverHtml() {
  vi.stubGlobal('localStorage', undefined)
  try {
    return renderToString(element())
  } finally {
    vi.unstubAllGlobals()
  }
}

describe('OpportunityScreen on the server', () => {
  it('renders "Loading…", not the link prompt, because it cannot know who is looking', () => {
    const html = serverHtml()
    expect(html).toMatch(/Loading/)
    expect(html).not.toMatch(/Link your account/)
  })

  it('fetches nothing on the server', () => {
    serverHtml()
    expect(load).not.toHaveBeenCalled()
  })
})

describe('OpportunityScreen in the browser', () => {
  it('hydrates server HTML without a mismatch, even though the browser has a session', async () => {
    localStorage.setItem(KEY, JSON.stringify(SESSION))
    const html = serverHtml()
    // React reports a mismatch as a "recoverable error" (it then throws away the server HTML).
    const mismatches: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)

    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => {
        root = hydrateRoot(container, element(), { onRecoverableError: (error) => mismatches.push(error) })
      })
      expect(mismatches).toEqual([])
    } finally {
      // Always tear the root down, so a failure here cannot leak into the next test.
      await act(async () => root?.unmount())
      container.remove()
    }
  })

  it('reads the stored session after mounting, then loads and shows the opportunity', async () => {
    localStorage.setItem(KEY, JSON.stringify(SESSION))
    render(element())

    await screen.findByRole('heading', { name: 'A visit idea: zucchini' })
    expect(load).toHaveBeenCalledWith('opp-1')
    expect(screen.getByRole('button', { name: /Confirm Thu 4pm/ })).toBeTruthy()
  })

  it('shows the link prompt, and fetches nothing, when there is no stored session', async () => {
    render(element())

    const link = await screen.findByRole('link', { name: /link/i })
    expect(link.getAttribute('href')).toBe('/')
    expect(load).not.toHaveBeenCalled()
  })

  it('treats a corrupted stored session as not linked', async () => {
    localStorage.setItem(KEY, '{not json')
    render(element())

    await screen.findByRole('link', { name: /link/i })
    expect(load).not.toHaveBeenCalled()
  })
})
