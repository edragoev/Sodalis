// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MoodFace, moodLevel } from '@/components/MoodFace'

// Which face a call's mood_score (-1 … 1) gets, and that a call without a score never looks like a mood.

afterEach(cleanup)

describe('moodLevel', () => {
  it.each([
    [1, 'great'], [0.6, 'great'], [0.59, 'good'], [0.2, 'good'], [0.19, 'okay'], [0, 'okay'],
    [-0.19, 'okay'], [-0.2, 'low'], [-0.59, 'low'], [-0.6, 'veryLow'], [-1, 'veryLow'],
  ])('score %s is %s', (score, level) => {
    expect(moodLevel(score)).toBe(level)
  })

  it('treats a missing score as unknown', () => {
    expect(moodLevel(null)).toBe('unknown')
    expect(moodLevel(undefined)).toBe('unknown')
  })
})

describe('MoodFace', () => {
  it('names the face for screen readers', () => {
    render(createElement(MoodFace, { score: -0.8 }))
    expect(screen.getByRole('img', { name: 'Very low' })).toBeTruthy()
  })

  it('shows the unknown face when there is no score', () => {
    render(createElement(MoodFace, { score: null }))
    expect(screen.getByRole('img', { name: 'Mood unknown' })).toBeTruthy()
  })
})
