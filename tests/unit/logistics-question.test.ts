// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import LogisticsQuestion from '@/components/LogisticsQuestion'

let latest = ''
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  latest = value
  return createElement(LogisticsQuestion, { value, onChange: setValue })
}

afterEach(() => {
  cleanup()
  latest = ''
})

const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('LogisticsQuestion', () => {
  it('turns taps into the stored sentence', () => {
    render(createElement(Harness))
    tap('I drive')
    tap('15 to 30 min')
    fireEvent.change(screen.getByLabelText(/anything else/i), { target: { value: 'Weekends only' } })
    expect(latest).toBe('Getting there: I drive. Distance: 15 to 30 min. Note: Weekends only')
    expect(pressed('I drive')).toBe('true')
    expect(pressed('15 to 30 min')).toBe('true')
  })

  it('tapping the chosen option again clears it', () => {
    render(createElement(Harness))
    tap('I drive')
    tap('I drive')
    expect(latest).toBe('')
    expect(pressed('I drive')).toBe('false')
  })

  it('choosing "only call or video" hides the distance question', () => {
    render(createElement(Harness))
    expect(screen.getByRole('button', { name: 'Under 15 min' })).toBeTruthy()
    tap('I can only call or video')
    expect(screen.queryByRole('button', { name: 'Under 15 min' })).toBeNull()
    expect(latest).toBe('Getting there: I can only call or video.')
  })

  it('preselects from a saved answer', () => {
    render(createElement(Harness, { initial: 'Getting there: Someone drives me. Distance: Over an hour. Note: Sundays' }))
    expect(pressed('Someone drives me')).toBe('true')
    expect(pressed('Over an hour')).toBe('true')
    expect((screen.getByLabelText(/anything else/i) as HTMLTextAreaElement).value).toBe('Sundays')
  })

  it('keeps an older free-text answer in the note box instead of losing it', () => {
    render(createElement(Harness, { initial: 'Usually free on weekends, about 20 minutes away by car.' }))
    expect((screen.getByLabelText(/anything else/i) as HTMLTextAreaElement).value).toBe('Usually free on weekends, about 20 minutes away by car.')
    tap('I drive')
    expect(latest).toBe('Getting there: I drive. Note: Usually free on weekends, about 20 minutes away by car.')
  })

  it('lets you type spaces in the note without them being eaten', () => {
    render(createElement(Harness))
    const note = screen.getByLabelText(/anything else/i) as HTMLTextAreaElement
    fireEvent.change(note, { target: { value: 'weekends ' } })
    expect(note.value).toBe('weekends ')
    fireEvent.change(note, { target: { value: 'weekends only' } })
    expect(note.value).toBe('weekends only')
  })
})
