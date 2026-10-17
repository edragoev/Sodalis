// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OpportunityScreen from '@/components/OpportunityScreen'
import type { OpportunityData } from '@/lib/opportunity-view'

// The page a tapped notification opens: the quote, the proposed slots, and a Confirm button per slot.
// Data loading and the confirm call are injected, so no network or database is involved.

const SENIOR = 'senior-1'
const me = { member_id: 'm1', senior_id: SENIOR }

const loaded = (over: Partial<OpportunityData['opportunity']> = {}): OpportunityData => ({
  opportunity: {
    id: 'opp-1',
    senior_id: SENIOR,
    type: 'gift_errand',
    summary: 'Has extra zucchini',
    quote: 'My zucchini are out of control.',
    mentioned_item: 'zucchini',
    urgency: 'normal',
    status: 'proposed',
    accepted_by: null,
    proposed_slots: [
      { id: 'slot-a', starts_at: '2026-10-15T20:00:00Z' },
      { id: 'slot-b', starts_at: '2026-10-16T14:00:00Z' },
    ],
    ...over,
  },
  members: [{ id: 'm1', name: 'Danny' }, { id: 'm2', name: 'Maya' }],
  timezone: 'America/Toronto',
})

const load = vi.fn()
const confirm = vi.fn()

function show(session: typeof me | null = me) {
  return render(createElement(OpportunityScreen, { opportunityId: 'opp-1', session, load, confirm }))
}

beforeEach(() => {
  vi.clearAllMocks()
  load.mockResolvedValue(loaded())
  confirm.mockResolvedValue({ ok: true, visitId: 'v1' })
})
afterEach(cleanup)

describe('OpportunityScreen', () => {
  it('shows a loading state, then loads the opportunity by id', async () => {
    show()
    expect(screen.getByText(/loading/i)).toBeTruthy()

    await screen.findByRole('heading', { name: 'A visit idea: zucchini' })
    expect(load).toHaveBeenCalledWith('opp-1')
  })

  it('shows the elder\'s quote', async () => {
    show()
    expect(await screen.findByText(/My zucchini are out of control\./)).toBeTruthy()
  })

  it('offers one Confirm button per slot, labelled with the time', async () => {
    show()
    await screen.findByRole('heading', { name: 'A visit idea: zucchini' })

    expect(screen.getByRole('button', { name: /Confirm Thu 4pm/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Confirm Fri 10am/ })).toBeTruthy()
  })

  describe('confirming a slot', () => {
    it('sends the opportunity, slot and member, then tells the person they are all set', async () => {
      show()
      fireEvent.click(await screen.findByRole('button', { name: /Confirm Thu 4pm/ }))

      await screen.findByText(/all set/i)
      expect(confirm).toHaveBeenCalledWith({ opportunity_id: 'opp-1', slot_id: 'slot-a', member_id: 'm1' })
      expect(screen.getByText(/Thu 4pm/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull()
    })

    it('does not send twice if the button is pressed again while waiting', async () => {
      let finish!: (v: unknown) => void
      confirm.mockReturnValue(new Promise((resolve) => (finish = resolve)))
      show()

      const button = await screen.findByRole('button', { name: /Confirm Thu 4pm/ })
      fireEvent.click(button)
      fireEvent.click(button)

      expect(confirm).toHaveBeenCalledTimes(1)
      expect((screen.getByRole('button', { name: /Confirm Fri 10am/ }) as HTMLButtonElement).disabled).toBe(true)
      finish({ ok: true, visitId: 'v1' })
      await screen.findByText(/all set/i)
    })

    it('says who got there first when someone else already claimed it, and stops offering slots', async () => {
      confirm.mockResolvedValue({ ok: false, reason: 'already_covered', coveredBy: 'Maya' })
      show()
      fireEvent.click(await screen.findByRole('button', { name: /Confirm Thu 4pm/ }))

      await screen.findByText(/Already covered by Maya/)
      expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull()
    })

    it('says "someone" when the server does not name who got there first', async () => {
      confirm.mockResolvedValue({ ok: false, reason: 'already_covered', coveredBy: null })
      show()
      fireEvent.click(await screen.findByRole('button', { name: /Confirm Thu 4pm/ }))
      await screen.findByText(/Already covered by someone/)
    })

    it('shows an error and lets the person try again when the request fails', async () => {
      confirm.mockResolvedValueOnce({ ok: false, reason: 'error' })
      show()
      fireEvent.click(await screen.findByRole('button', { name: /Confirm Thu 4pm/ }))

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(/something went wrong/i)

      const retry = screen.getByRole('button', { name: /Confirm Thu 4pm/ }) as HTMLButtonElement
      expect(retry.disabled).toBe(false)
      fireEvent.click(retry)
      await screen.findByText(/all set/i)
      expect(confirm).toHaveBeenCalledTimes(2)
    })
  })

  describe('other states', () => {
    it('says who is covering an idea that is already confirmed, with nothing to press', async () => {
      load.mockResolvedValue(loaded({ status: 'confirmed', accepted_by: 'm2' }))
      show()

      await screen.findByText(/Maya is covering this/)
      expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull()
    })

    it('thanks the viewer when they are the one who claimed it', async () => {
      load.mockResolvedValue(loaded({ status: 'confirmed', accepted_by: 'm1' }))
      show()
      await screen.findByText(/You.re covering this/)
    })

    it.each([
      ['declined', /declined/i],
      ['expired', /expired|no longer/i],
    ])('shows a %s idea as closed', async (status, text) => {
      load.mockResolvedValue(loaded({ status }))
      show()
      await screen.findByText(text)
      expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull()
    })

    it('says it could not find an opportunity that does not exist', async () => {
      load.mockResolvedValue(null)
      show()
      await screen.findByText(/couldn.t find/i)
    })

    it('shows an error if loading fails', async () => {
      load.mockRejectedValue(new Error('Could not load the opportunity'))
      show()
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(/couldn.t load|try again/i)
    })

    it('asks someone who has not linked to link first, with no quote and no buttons', async () => {
      show(null)

      const link = await screen.findByRole('link', { name: /link/i })
      expect(link.getAttribute('href')).toBe('/')
      expect(screen.queryByText(/zucchini/)).toBeNull()
      expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull()
    })

    it('shows nothing private to a member of a different family', async () => {
      show({ member_id: 'x', senior_id: 'someone-else' })

      await waitFor(() => expect(screen.queryByText(/loading/i)).toBeNull())
      expect(screen.queryByText(/zucchini/)).toBeNull()
      expect(screen.queryByRole('button', { name: /Confirm/ })).toBeNull()
    })
  })
})
