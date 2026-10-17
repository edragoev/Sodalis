import { describe, expect, it } from 'vitest'
import { templateFallback, validateDecision, type Decision } from '@/lib/coordinator/validate'

// Code checks Gemini's answer before anything is sent (specs/08-agents/coordinator-agent.md "Validation").

const shortlist = [
  { member_id: 'danny', slots: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }] },
  { member_id: 'maya', slots: [{ id: 's5' }] },
]

const decision = (over: Partial<Decision> = {}): Decision => ({
  member_id: 'danny',
  slot_ids: ['s1', 's2'],
  title: 'Grandma would love to see you',
  body: "'My zucchini are out of control.' Thu 4pm or Fri 10am?",
  why: 'Grandma asked for Danny by name.',
  ...over,
})

describe('validateDecision', () => {
  it('accepts a decision that stays on the shortlist', () => {
    expect(validateDecision(decision(), shortlist)).toEqual({ ok: true })
  })

  it('rejects a member who is not on the shortlist', () => {
    expect(validateDecision(decision({ member_id: 'sam' }), shortlist)).toEqual({ ok: false, reason: 'member_not_on_shortlist' })
  })

  it("rejects a slot that belongs to another member's list", () => {
    expect(validateDecision(decision({ slot_ids: ['s1', 's5'] }), shortlist)).toEqual({ ok: false, reason: 'slot_not_for_member' })
  })

  it('rejects a slot that does not exist', () => {
    expect(validateDecision(decision({ slot_ids: ['nope'] }), shortlist)).toEqual({ ok: false, reason: 'slot_not_for_member' })
  })

  it.each([
    ['no slots', []],
    ['more than 3 slots', ['s1', 's2', 's3', 's4']],
    ['a repeated slot', ['s1', 's1']],
  ])('rejects %s', (_name, slot_ids) => {
    const result = validateDecision(decision({ slot_ids }), shortlist)
    expect(result).toMatchObject({ ok: false })
  })

  it.each(['title', 'body', 'why'] as const)('rejects an empty %s', (field) => {
    expect(validateDecision(decision({ [field]: '   ' }), shortlist)).toEqual({ ok: false, reason: 'invalid_output' })
  })

  it.each([null, undefined, 'text', 42, [], {}])('rejects output that is not a decision (%j)', (bad) => {
    expect(validateDecision(bad as unknown as Decision, shortlist)).toMatchObject({ ok: false })
  })

  it.each(['her medication', 'blood pressure', 'since her fall', 'the diagnosis'])(
    'rejects text that mentions health (%s)',
    (phrase) => {
      expect(validateDecision(decision({ body: `Grandma mentioned ${phrase}. Thu 4pm?` }), shortlist)).toEqual({
        ok: false,
        reason: 'health_mentioned',
      })
      expect(validateDecision(decision({ title: phrase }), shortlist)).toMatchObject({ ok: false, reason: 'health_mentioned' })
    },
  )

  it('does not mistake ordinary words for health words', () => {
    expect(validateDecision(decision({ body: "She fell in love with the garden. Thu 4pm?" }), shortlist)).toEqual({ ok: true })
  })
})

describe('templateFallback', () => {
  const opportunity = { id: 'opp-1', summary: 'Has extra zucchini', quote: 'My zucchini are out of control.', mentioned_item: 'zucchini' }
  const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, starts_at: `2026-10-1${i + 5}T20:00:00Z` }))

  it("uses the shortlist's first member and their first 3 slots", () => {
    const result = templateFallback(opportunity, [
      { member_id: 'danny', slots: slots(4) },
      { member_id: 'maya', slots: slots(1) },
    ])
    expect(result.member_id).toBe('danny')
    expect(result.slot_ids).toEqual(['s1', 's2', 's3'])
  })

  it('writes a title and body that carry the item and the quote', () => {
    const result = templateFallback(opportunity, [{ member_id: 'danny', slots: slots(2) }])
    expect(result.title).toContain('zucchini')
    expect(result.body).toContain('My zucchini are out of control.')
  })

  it('says why the fallback chose that member', () => {
    expect(templateFallback(opportunity, [{ member_id: 'danny', slots: slots(1) }]).why.trim()).not.toBe('')
  })

  it('works when the opportunity has no quote or item', () => {
    const result = templateFallback({ id: 'o', summary: 'Wants company', quote: null, mentioned_item: null }, [
      { member_id: 'danny', slots: slots(1) },
    ])
    expect(result.title).toContain('Wants company')
    expect(result.body.trim()).not.toBe('')
  })
})
