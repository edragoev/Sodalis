// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LinkFlow from '@/components/LinkFlow'

// A number we don't know must not silently start a new profile: a bottom tray explains it
// and lets the person fix a typo or deliberately set up someone new.

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))

const lookup = (body: Record<string, unknown>) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))

async function enterNumber(value: string) {
  fireEvent.change(screen.getByLabelText(/their phone number/i), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

beforeEach(() => {
  push.mockReset()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('number not found', () => {
  it('shows a tray with the number, and does not jump into setup', async () => {
    vi.stubGlobal('fetch', lookup({ found: false }))
    render(createElement(LinkFlow))
    await enterNumber('4156778345')

    const tray = await screen.findByRole('dialog')
    expect(tray.textContent).toContain("We couldn't find that number")
    expect(tray.textContent).toContain('(415) 677-8345') // readable, not "+1 4156778345"
    expect(screen.queryByText(/tell us a little about them/i)).toBeNull()
  })

  it('"Re-enter the number" closes the tray and keeps what was typed', async () => {
    vi.stubGlobal('fetch', lookup({ found: false }))
    render(createElement(LinkFlow))
    await enterNumber('4156778345')
    fireEvent.click(await screen.findByRole('button', { name: /re-enter the number/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((screen.getByLabelText(/their phone number/i) as HTMLInputElement).value).toBe('4156778345')
  })

  it('Escape closes the tray', async () => {
    vi.stubGlobal('fetch', lookup({ found: false }))
    render(createElement(LinkFlow))
    await enterNumber('4156778345')
    await screen.findByRole('dialog')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('"Set up their profile" moves on to the loved-one setup with a readable number', async () => {
    vi.stubGlobal('fetch', lookup({ found: false }))
    render(createElement(LinkFlow))
    await enterNumber('4156778345')
    fireEvent.click(await screen.findByRole('button', { name: /set up their profile/i }))

    expect(await screen.findByText(/we don.t have \(415\) 677-8345 yet/i)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('an invalid-number message goes away when the number is edited or cleared', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: "That doesn't look like a valid mobile number." }), { status: 400 })))
    render(createElement(LinkFlow))
    await enterNumber('1234567890')
    expect(await screen.findByText(/doesn.t look like a valid mobile number/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/their phone number/i), { target: { value: '' } })
    expect(screen.queryByText(/doesn.t look like a valid mobile number/i)).toBeNull()
  })

  it('a known number skips the tray and goes to the profile picker', async () => {
    vi.stubGlobal('fetch', lookup({ found: true, senior_id: 'abc', senior_first_name: 'Margaret' }))
    render(createElement(LinkFlow))
    await enterNumber('4155550100')

    await waitFor(() => expect(push).toHaveBeenCalledWith('/profiles'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(JSON.parse(localStorage.getItem('sodalis.elder') ?? '{}')).toMatchObject({ senior_id: 'abc', name: 'Margaret' })
  })
})
