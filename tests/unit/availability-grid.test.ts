// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Availability from '@/components/Availability'

// The weekly grid: days across, 2-hour slots down. Tap a square, a day, a time of day or a preset.

const router = { push: vi.fn(), replace: vi.fn() } // stable between renders, like the real router
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/availability' }))

let saved: { windows: unknown } | undefined

function mockApi(initial: unknown[] = []) {
  saved = undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        saved = JSON.parse(String(init.body))
        return new Response(JSON.stringify(saved), { status: 200 })
      }
      return new Response(JSON.stringify({ windows: initial }), { status: 200 })
    }),
  )
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('sodalis.session', JSON.stringify({ member_id: 'm1', senior_id: 's1', name: 'Anna' }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const cell = (day: string, range: string) => screen.getByRole('button', { name: `${day} ${range}` })
const pressedCount = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').length
const load = async (initial: unknown[] = []) => {
  mockApi(initial)
  render(createElement(Availability))
  await screen.findByRole('group', { name: /weekly availability/i })
}

describe('Availability grid', () => {
  it('shows 49 squares: 7 days by 7 two-hour slots', async () => {
    await load()
    expect(screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))).toHaveLength(49)
    expect(pressedCount()).toBe(0)
  })

  it('shows saved times, including older wide windows, as whole slots', async () => {
    await load([{ dow: 1, start: '08:00', end: '12:00' }])
    expect(cell('Monday', '8 am to 10 am').getAttribute('aria-pressed')).toBe('true')
    expect(cell('Monday', '10 am to 12 pm').getAttribute('aria-pressed')).toBe('true')
    expect(cell('Monday', '12 pm to 2 pm').getAttribute('aria-pressed')).toBe('false')
    expect(pressedCount()).toBe(2)
  })

  it('a tap toggles one square and enables Save', async () => {
    await load()
    const save = screen.getByRole('button', { name: 'Save my times' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(cell('Tuesday', '2 pm to 4 pm'))
    expect(pressedCount()).toBe(1)
    expect(save.disabled).toBe(false)
    fireEvent.click(cell('Tuesday', '2 pm to 4 pm'))
    expect(pressedCount()).toBe(0)
  })

  it('tapping a day fills its whole column, and again clears it', async () => {
    await load()
    fireEvent.click(screen.getByRole('button', { name: 'Every time on Saturday' }))
    expect(pressedCount()).toBe(7)
    expect(cell('Saturday', '8 pm to 10 pm').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Every time on Saturday' }))
    expect(pressedCount()).toBe(0)
  })

  it('tapping a time of day fills that row across the week', async () => {
    await load()
    fireEvent.click(screen.getByRole('button', { name: '6 pm to 8 pm, every day' }))
    expect(pressedCount()).toBe(7)
    expect(cell('Sunday', '6 pm to 8 pm').getAttribute('aria-pressed')).toBe('true')
  })

  it('presets fill and clear their squares', async () => {
    await load()
    fireEvent.click(screen.getByRole('button', { name: 'Weekends' }))
    expect(pressedCount()).toBe(12) // Saturday and Sunday, 8 am to 8 pm
    expect(cell('Saturday', '8 pm to 10 pm').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Weekends' }))
    expect(pressedCount()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Weekday evenings' }))
    expect(pressedCount()).toBe(10) // Monday to Friday, 4 to 8 pm
  })

  it('Clear all empties the grid', async () => {
    await load([{ dow: 0, start: '08:00', end: '22:00' }])
    expect(pressedCount()).toBe(7)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(pressedCount()).toBe(0)
  })

  it('Save sends touching slots as one window and confirms', async () => {
    await load()
    fireEvent.click(cell('Monday', '4 pm to 6 pm'))
    fireEvent.click(cell('Monday', '6 pm to 8 pm'))
    fireEvent.click(cell('Friday', '10 am to 12 pm'))
    fireEvent.click(screen.getByRole('button', { name: 'Save my times' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^Saved/))
    expect(saved?.windows).toEqual([
      { dow: 1, start: '16:00', end: '20:00' },
      { dow: 5, start: '10:00', end: '12:00' },
    ])
    expect((screen.getByRole('button', { name: 'Save my times' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
