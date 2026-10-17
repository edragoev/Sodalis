import { describe, expect, it } from 'vitest'
import { buildOpportunityView, type OpportunityData } from '@/lib/opportunity-view'

// What /opportunities/[id] shows, decided in one pure function so every state is easy to test.
// States follow the lifecycle in specs/06-notifications/conversation-to-visit.md section 7.

const SENIOR = 'senior-1'
const me = { member_id: 'm1', senior_id: SENIOR }

// 2026-10-15 is a Thursday; 20:00Z is 4pm in Toronto.
const data = (over: Partial<OpportunityData['opportunity']> = {}): OpportunityData => ({
  opportunity: {
    id: 'opp-1',
    senior_id: SENIOR,
    type: 'gift_errand',
    summary: 'The elder has more zucchini than they can use.',
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

describe('buildOpportunityView', () => {
  describe('an open idea (proposed)', () => {
    it('shows a warm title, the quote and the slots', () => {
      const view = buildOpportunityView(data(), me)

      expect(view.state).toBe('open')
      expect(view.title).toBe('A visit idea: zucchini')
      expect(view.quote).toBe('My zucchini are out of control.')
      expect(view.slots).toEqual([
        { id: 'slot-a', label: 'Thu 4pm' },
        { id: 'slot-b', label: 'Fri 10am' },
      ])
    })

    it('lets a member of that family confirm', () => {
      expect(buildOpportunityView(data(), me).canConfirm).toBe(true)
    })

    it('falls back to the summary for a title when no item was mentioned', () => {
      const view = buildOpportunityView(data({ mentioned_item: null }), me)
      expect(view.title).toBe('A visit idea: The elder has more zucchini than they can use.')
    })

    it('omits the quote when there is none', () => {
      expect(buildOpportunityView(data({ quote: null }), me).quote).toBeNull()
    })

    it('drops slots with an invalid date instead of showing "Invalid Date"', () => {
      const view = buildOpportunityView(
        data({ proposed_slots: [{ id: 'bad', starts_at: 'garbage' }, { id: 'slot-a', starts_at: '2026-10-15T20:00:00Z' }] }),
        me,
      )
      expect(view.slots.map((s) => s.id)).toEqual(['slot-a'])
    })

    it('cannot be confirmed when there are no slots to pick', () => {
      const view = buildOpportunityView(data({ proposed_slots: [] }), me)
      expect(view.state).toBe('open')
      expect(view.canConfirm).toBe(false)
    })
  })

  describe('already claimed (confirmed)', () => {
    it('says who is covering it, and offers nothing to confirm', () => {
      const view = buildOpportunityView(data({ status: 'confirmed', accepted_by: 'm2' }), me)

      expect(view.state).toBe('claimed')
      expect(view.claimedBy).toBe('Maya')
      expect(view.canConfirm).toBe(false)
    })

    it('recognizes when it was the viewer who claimed it', () => {
      const view = buildOpportunityView(data({ status: 'confirmed', accepted_by: 'm1' }), me)
      expect(view.state).toBe('claimed_by_me')
      expect(view.canConfirm).toBe(false)
    })

    it('copes with a claimer who is no longer in the family list', () => {
      const view = buildOpportunityView(data({ status: 'confirmed', accepted_by: 'gone' }), me)
      expect(view.state).toBe('claimed')
      expect(view.claimedBy).toBe('someone')
    })
  })

  describe('other states', () => {
    it.each(['declined', 'expired'] as const)('shows %s as closed, with nothing to confirm', (status) => {
      const view = buildOpportunityView(data({ status }), me)
      expect(view.state).toBe(status)
      expect(view.canConfirm).toBe(false)
    })

    it('shows an idea that has not been sent out yet (detected) as not ready', () => {
      const view = buildOpportunityView(data({ status: 'detected' }), me)
      expect(view.state).toBe('preparing')
      expect(view.canConfirm).toBe(false)
    })
  })

  describe('who is looking', () => {
    it('asks someone who has not linked to link first, and shows nothing private', () => {
      const view = buildOpportunityView(data(), null)

      expect(view.state).toBe('needs_link')
      expect(view.canConfirm).toBe(false)
      expect(view.quote).toBeNull()
      expect(view.slots).toEqual([])
    })

    it('shows nothing from another family\'s elder', () => {
      const view = buildOpportunityView(data(), { member_id: 'x', senior_id: 'someone-else' })

      expect(view.state).toBe('not_your_family')
      expect(view.canConfirm).toBe(false)
      expect(view.quote).toBeNull()
      expect(view.slots).toEqual([])
    })
  })
})
