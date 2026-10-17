// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TagInput from '@/components/TagInput'

// Tags are typed in a box that stays put; what you add drops into a row underneath it.

function Harness({ suggestions = ['gardening', 'cooking'] }: { suggestions?: string[] }) {
  const [values, setValues] = useState<string[]>([])
  return createElement(TagInput, { id: 'interests', label: 'Interests', values, onChange: setValues, suggestions })
}

afterEach(cleanup)

const type = (text: string) => {
  const box = screen.getByLabelText('Interests') as HTMLInputElement
  fireEvent.change(box, { target: { value: text } })
  fireEvent.keyDown(box, { key: 'Enter' })
}

describe('TagInput', () => {
  it('puts added tags below the typing box, and clears the box', () => {
    render(createElement(Harness))
    type('Dancing')

    const box = screen.getByLabelText('Interests') as HTMLInputElement
    const added = screen.getByRole('group', { name: /interests added/i })
    expect(within(added).getByText('dancing')).toBeTruthy() // lowercased
    expect(box.value).toBe('')
    // the box comes first in the page, the added tags after it
    expect(box.compareDocumentPosition(added) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the box above the tags however many are added', () => {
    render(createElement(Harness))
    ;['dancing', 'chess', 'tea'].forEach(type)
    const box = screen.getByLabelText('Interests')
    const added = screen.getByRole('group', { name: /interests added/i })
    expect(within(added).getAllByRole('button')).toHaveLength(3) // one remove button per tag
    expect(box.compareDocumentPosition(added) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a tapped suggestion becomes an added tag and leaves the suggestions', () => {
    render(createElement(Harness))
    fireEvent.click(screen.getByRole('button', { name: '+ gardening' }))
    expect(within(screen.getByRole('group', { name: /interests added/i })).getByText('gardening')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ gardening' })).toBeNull()
  })

  it('ignores duplicates and removes a tag with its ×', () => {
    render(createElement(Harness))
    type('chess')
    type('Chess')
    const added = screen.getByRole('group', { name: /interests added/i })
    expect(within(added).getAllByText('chess')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove chess' }))
    expect(screen.queryByRole('group', { name: /interests added/i })).toBeNull()
  })

  it('a comma adds the tag too', () => {
    render(createElement(Harness))
    fireEvent.change(screen.getByLabelText('Interests'), { target: { value: 'tea,' } })
    expect(within(screen.getByRole('group', { name: /interests added/i })).getByText('tea')).toBeTruthy()
  })
})
