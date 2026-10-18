// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Sign out asks first, then forgets the profile and the elder on this phone and goes to the start.

const router = { replace: vi.fn(), push: vi.fn() } // stable between renders, like the real router
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import SignOutButton from '@/components/SignOutButton'

beforeEach(() => {
  router.replace.mockReset()
  localStorage.setItem('sodalis.session', JSON.stringify({ member_id: 'm1', senior_id: 's1', name: 'Maya' }))
  localStorage.setItem('sodalis.elder', JSON.stringify({ senior_id: 's1', name: 'Margaret' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('SignOutButton', () => {
  it('asks before signing out, and Cancel keeps you signed in', () => {
    render(createElement(SignOutButton))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('dialog', { name: 'Sign out on this phone?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem('sodalis.session')).not.toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('forgets the profile and the elder, then goes to the phone-number screen', () => {
    render(createElement(SignOutButton))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog.querySelector('button') as HTMLButtonElement)

    expect(localStorage.getItem('sodalis.session')).toBeNull()
    expect(localStorage.getItem('sodalis.elder')).toBeNull()
    expect(router.replace).toHaveBeenCalledWith('/')
  })
})
