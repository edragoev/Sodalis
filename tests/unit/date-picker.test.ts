// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DatePicker from '@/components/DatePicker'

// A birthday picker: custom calendar in a tray, past dates only, jump by month/year.

const change = vi.fn()

function Harness({ initial = '', startYear }: { initial?: string; startYear?: number }) {
  const [value, setValue] = useState(initial)
  return createElement(DatePicker, {
    id: 'bday',
    value,
    placeholder: 'Select their birthday',
    startYear,
    onChange: (v: string) => {
      change(v)
      setValue(v)
    },
  })
}

afterEach(() => {
  cleanup()
  change.mockReset()
})

const openIt = () => fireEvent.click(screen.getByRole('button', { name: /select their birthday|,/i }))

describe('DatePicker', () => {
  it('starts closed and shows the placeholder', () => {
    render(createElement(Harness))
    expect(screen.getByText('Select their birthday')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('jumps to a month and year, picks a day, and reports an ISO date', () => {
    render(createElement(Harness, { startYear: 1950 }))
    openIt()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { expanded: false })) // "<Month> 1950"
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mar' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '1948' }))
    fireEvent.click(within(dialog).getByRole('button', { name: /show days/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'March 14, 1948' }))
    fireEvent.click(within(dialog).getByRole('button', { name: /select march 14, 1948/i }))

    expect(change).toHaveBeenCalledWith('1948-03-14')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('March 14, 1948')).toBeTruthy() // the field now reads nicely
  })

  it('opens on the saved date', () => {
    render(createElement(Harness, { initial: '1948-03-14' }))
    openIt()
    const day = within(screen.getByRole('dialog')).getByRole('button', { name: 'March 14, 1948' })
    expect(day.getAttribute('aria-pressed')).toBe('true')
  })

  it('does not let you pick a day in the future', () => {
    render(createElement(Harness))
    openIt()
    const dialog = screen.getByRole('dialog')
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    if (tomorrow.getMonth() === now.getMonth()) {
      const label = tomorrow.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      expect((within(dialog).getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(true)
    }
    expect((within(dialog).getByRole('button', { name: /next month/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('"Select" stays disabled until a day is chosen', () => {
    render(createElement(Harness))
    openIt()
    expect((within(screen.getByRole('dialog')).getByRole('button', { name: /pick a day/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Clear empties the value and closes', () => {
    render(createElement(Harness, { initial: '1948-03-14' }))
    openIt()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear' }))
    expect(change).toHaveBeenCalledWith('')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Select their birthday')).toBeTruthy()
  })

  it('Escape closes without changing anything', () => {
    render(createElement(Harness, { initial: '1948-03-14' }))
    openIt()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'March 20, 1948' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(change).not.toHaveBeenCalled()
  })
})
