import { describe, expect, it } from 'vitest'
import { composeLogistics, logisticsConstraints, parseLogistics } from '@/lib/logistics'

describe('logistics sentence', () => {
  it('composes the choices and the note into one readable sentence', () => {
    expect(composeLogistics({ transport: 'I drive', distance: '15 to 30 min', note: 'weekends only' })).toBe(
      'Getting there: I drive. Distance: 15 to 30 min. Note: weekends only',
    )
  })

  it('leaves out what was not chosen', () => {
    expect(composeLogistics({ transport: '', distance: '', note: '' })).toBe('')
    expect(composeLogistics({ transport: '', distance: '', note: 'weekends only' })).toBe('Note: weekends only')
    expect(composeLogistics({ transport: 'I drive', distance: '', note: '   ' })).toBe('Getting there: I drive.')
  })

  it('drops the distance for someone who can only call or video', () => {
    expect(composeLogistics({ transport: 'I can only call or video', distance: 'Under 15 min', note: '' })).toBe(
      'Getting there: I can only call or video.',
    )
  })

  it('round-trips what it composes, including a note with a period and spaces', () => {
    const l = { transport: 'Someone drives me', distance: 'Over an hour', note: 'Never before 10. Sundays are best ' }
    expect(parseLogistics(composeLogistics(l))).toEqual(l)
  })

  it('reads a hand-written sentence that leaves out the periods', () => {
    expect(parseLogistics('Getting there: I drive. Distance: 15 to 30 min')).toEqual({ transport: 'I drive', distance: '15 to 30 min', note: '' })
    expect(parseLogistics('Getting there: I take public transport Distance: Over an hour')).toEqual({
      transport: 'I take public transport',
      distance: 'Over an hour',
      note: '',
    })
    expect(parseLogistics('Distance: Under 15 min. Note: weekends')).toEqual({ transport: '', distance: 'Under 15 min', note: 'weekends' })
  })

  it('treats an empty answer as nothing chosen, and old free text as not ours', () => {
    expect(parseLogistics('')).toEqual({ transport: '', distance: '', note: '' })
    expect(parseLogistics('Usually free on weekends, about 20 minutes away by car.')).toBeNull()
    expect(parseLogistics('Getting there: I teleport.')).toBeNull() // unknown choice
    expect(parseLogistics('Getting there: I drive. Distance: nearby.')).toBeNull()
  })
})

describe('logisticsConstraints', () => {
  it('fills can_drive and travel_minutes from the choices, no guessing', () => {
    expect(logisticsConstraints({ transport: 'I drive', distance: '15 to 30 min', note: 'weekends only' })).toEqual({
      can_drive: true,
      travel_minutes: 30,
      notes: 'weekends only',
    })
    expect(logisticsConstraints({ transport: 'I take public transport', distance: 'Over an hour', note: '' })).toEqual({
      can_drive: false,
      travel_minutes: 90,
      notes: null,
    })
  })

  it('knows nothing it was not told', () => {
    expect(logisticsConstraints({ transport: '', distance: '', note: '' })).toEqual({ can_drive: null, travel_minutes: null, notes: null })
  })

  it('a remote-only person has no travel time and says so in the notes', () => {
    expect(logisticsConstraints({ transport: 'I can only call or video', distance: 'Under 15 min', note: 'Evenings' })).toEqual({
      can_drive: false,
      travel_minutes: null,
      notes: 'Can only call or video. Evenings',
    })
  })
})
