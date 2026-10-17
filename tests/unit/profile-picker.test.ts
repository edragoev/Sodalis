// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePicker from '@/components/ProfilePicker'

// The Netflix-style "who's checking in" screen: empty family -> "Add your family" (not a form),
// tiles show a first-name initial, "Add profile" returns to the tiles, tapping a tile signs in.

const push = vi.fn()
const replace = vi.fn()
// The real router object is stable between renders; a fresh one each time would re-run the screen's loader.
const router = { push, replace }
vi.mock('next/navigation', () => ({ useRouter: () => router }))

type M = { id: string; name: string; relationship: string; has_answers: boolean }
let members: M[] = []

function mockApi(onPost?: (body: Record<string, unknown>) => void) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        onPost?.(body)
        members = [...members, { id: 'new-1', name: String(body.name).split(' ')[0], relationship: body.relationship, has_answers: false }]
        return new Response(JSON.stringify({ member_id: 'new-1', senior_id: 'sen-1' }), { status: 200 })
      }
      return new Response(JSON.stringify({ senior_first_name: 'Mary', members }), { status: 200 })
    }),
  )
}

beforeEach(() => {
  members = []
  push.mockReset()
  replace.mockReset()
  localStorage.clear()
  localStorage.setItem('sodalis.elder', JSON.stringify({ senior_id: 'sen-1', name: 'Mary' }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProfilePicker', () => {
  it('with nobody yet, shows "Add your family" and the Add profile tile, not the form', async () => {
    mockApi()
    render(createElement(ProfilePicker))
    expect(await screen.findByRole('heading', { name: 'Add your family' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /add profile/i })).toBeTruthy()
    expect(screen.queryByLabelText(/first name/i)).toBeNull()
  })

  it('Add profile opens a form titled "Add profile" (not "Add your profile")', async () => {
    mockApi()
    render(createElement(ProfilePicker))
    fireEvent.click(await screen.findByRole('button', { name: /add profile/i }))
    expect(await screen.findByRole('heading', { name: 'Add profile' })).toBeTruthy()
    expect(screen.queryByText(/add your profile/i)).toBeNull()
  })

  it('the icon shows the first name initial as you type', async () => {
    mockApi()
    render(createElement(ProfilePicker))
    fireEvent.click(await screen.findByRole('button', { name: /add profile/i }))
    const heading = await screen.findByRole('heading', { name: 'Add profile' })
    const icon = () => heading.parentElement!.querySelector('span')!
    expect(icon().textContent).toBe('?')
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'anna smith' } })
    expect(icon().textContent).toBe('A') // first name's initial only, capitalised
  })

  it('adding a profile returns to the tiles with the new profile, and does not jump to the questionnaire', async () => {
    let posted: Record<string, unknown> | undefined
    mockApi((b) => (posted = b))
    render(createElement(ProfilePicker))
    fireEvent.click(await screen.findByRole('button', { name: /add profile/i }))
    fireEvent.change(await screen.findByLabelText('First name'), { target: { value: 'Danny' } })
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: 'He/him' } })
    fireEvent.change(screen.getByLabelText(/how are they related to mary/i), { target: { value: 'Grandson' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add profile' }))

    expect(await screen.findByText(/Danny's profile is ready/)).toBeTruthy()
    expect(posted).toMatchObject({ name: 'Danny', relationship: 'Grandson', pronouns: 'He/him' })
    expect(screen.getByRole('button', { name: /Danny/ }).textContent).toContain('D') // tile with an initial
    expect(push).not.toHaveBeenCalled()
    expect(localStorage.getItem('sodalis.session')).toBeNull() // nobody is signed in just by being added
  })

  it('works for someone signed in by invite link, who never saved the family on this device', async () => {
    localStorage.clear()
    localStorage.setItem('sodalis.session', JSON.stringify({ member_id: 'm9', senior_id: 'sen-1', name: 'Zoe' }))
    members = [{ id: 'm9', name: 'Zoe', relationship: 'Niece or nephew', has_answers: true }]
    mockApi()
    render(createElement(ProfilePicker))
    expect(await screen.findByRole('heading', { name: "Who's checking in on Mary?" })).toBeTruthy()
    expect(replace).not.toHaveBeenCalledWith('/')
    expect(JSON.parse(localStorage.getItem('sodalis.elder')!)).toMatchObject({ senior_id: 'sen-1' })
  })

  it('tapping a profile with no answers opens the questionnaire; with answers, the dashboard', async () => {
    members = [
      { id: 'm1', name: 'Danny', relationship: 'Grandson', has_answers: false },
      { id: 'm2', name: 'Maya', relationship: 'Granddaughter', has_answers: true },
    ]
    mockApi()
    render(createElement(ProfilePicker))
    expect(await screen.findByRole('heading', { name: "Who's checking in on Mary?" })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Danny/ }))
    expect(push).toHaveBeenLastCalledWith('/questionnaire')
    expect(JSON.parse(localStorage.getItem('sodalis.session')!)).toMatchObject({ member_id: 'm1', senior_id: 'sen-1' })

    fireEvent.click(screen.getByRole('button', { name: /Maya/ }))
    await waitFor(() => expect(push).toHaveBeenLastCalledWith('/dashboard'))
  })
})
