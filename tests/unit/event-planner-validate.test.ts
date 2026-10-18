import { describe, expect, it } from 'vitest'
import { normalizeTargetDate, localDate } from '@/lib/event-planner/dates'
import { matchMentionedMember } from '@/lib/event-planner/members'
import { MAX_IDEAS, parseExtraction, quoteInTranscript } from '@/lib/event-planner/validate'

// Gemini's answer is checked field by field before anything is saved (specs/06-notifications section 3).

const TRANSCRIPT = "AI: Hello Rose!\nUser: My zucchini are out of control this year. Danny loves them, you know."
const ctx = { transcript: TRANSCRIPT, today: '2026-10-15' }

const idea = (over: Record<string, unknown> = {}) => ({
  type: 'gift_errand',
  summary: 'The elder has more zucchini than they can use.',
  quote: 'My zucchini are out of control this year.',
  mentioned_member: 'Danny',
  mentioned_item: 'zucchini',
  interest_tags: ['Gardening', 'cooking'],
  target_date: null,
  urgency: 'normal',
  confidence: 0.86,
  suggested_kind: 'visit',
  ...over,
})
const parse = (...ideas: unknown[]) => parseExtraction({ opportunities: ideas }, ctx)

describe('parseExtraction', () => {
  it('accepts a good idea and tidies it', () => {
    const r = parse(idea())
    expect(r).toMatchObject({ ok: true, dropped: [] })
    if (r.ok) expect(r.ideas[0]).toMatchObject({ type: 'gift_errand', interest_tags: ['gardening', 'cooking'], confidence: 0.86 })
  })

  it('treats an empty list as a call with nothing to suggest', () => {
    expect(parse()).toEqual({ ok: true, ideas: [], dropped: [] })
  })

  it.each([null, 'text', [], {}, { opportunities: 'x' }, { opportunities: null }])('rejects a bad envelope: %j', (raw) => {
    expect(parseExtraction(raw, ctx)).toEqual({ ok: false, reason: 'invalid_output' })
  })

  it.each([
    ['bad_type', { type: 'party' }],
    ['bad_summary', { summary: '  ' }],
    ['bad_quote', { quote: 42 }],
    ['quote_not_in_transcript', { quote: 'I adore opera.' }],
    ['bad_member', { mentioned_member: 7 }],
    ['bad_item', { mentioned_item: {} }],
    ['bad_tags', { interest_tags: 'garden' }],
    ['bad_tags', { interest_tags: [1] }],
    ['bad_urgency', { urgency: 'asap' }],
    ['bad_confidence', { confidence: 1.2 }],
    ['bad_confidence', { confidence: '0.9' }],
    ['bad_confidence', { confidence: -0.1 }],
    ['bad_kind', { suggested_kind: 'text' }],
    ['health_in_summary', { summary: 'Her knee hurts, so she needs company.' }],
  ])('drops an idea with %s and keeps the others', (reason, over) => {
    const r = parse(idea(over), idea({ type: 'activity' }))
    expect(r).toMatchObject({ ok: true, dropped: [{ index: 0, reason }] })
    if (r.ok) expect(r.ideas).toHaveLength(1)
  })

  it('drops something that is not an object', () => {
    expect(parse('nope')).toMatchObject({ ok: true, ideas: [], dropped: [{ index: 0, reason: 'not_an_object' }] })
  })

  it('caps the number of ideas', () => {
    const r = parse(...Array.from({ length: MAX_IDEAS + 2 }, () => idea()))
    if (r.ok) {
      expect(r.ideas).toHaveLength(MAX_IDEAS)
      expect(r.dropped.map((d) => d.reason)).toEqual(['too_many', 'too_many'])
    }
  })

  it('blanks an unusable date instead of keeping it', () => {
    const r = parse(idea({ target_date: '2020-01-01' }))
    if (r.ok) expect(r.ideas[0].target_date).toBeNull()
  })
})

describe('quoteInTranscript', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(quoteInTranscript('my ZUCCHINI are out of control, this year', TRANSCRIPT)).toBe(true)
  })
  it('rejects words the elder never said', () => {
    expect(quoteInTranscript('I want to see Danny', TRANSCRIPT)).toBe(false)
  })
})

describe('normalizeTargetDate', () => {
  const today = '2026-10-15'
  it.each([
    ['2026-10-15', '2026-10-15'],
    ['2026-10-20', '2026-10-20'],
    ['2026-10-20T09:00:00Z', '2026-10-20'],
    ['2027-10-15', '2027-10-15'],
  ])('keeps %s', (input, out) => expect(normalizeTargetDate(input, today)).toBe(out))

  it.each(['2026-10-14', '2028-01-01', '2026-02-30', 'next Tuesday', '', null, 5, undefined])('drops %j', (input) => {
    expect(normalizeTargetDate(input, today)).toBeNull()
  })
})

describe('localDate', () => {
  it('reads the date in the elder’s zone, not UTC', () => {
    expect(localDate(new Date('2026-10-16T02:30:00Z'), 'America/Toronto')).toBe('2026-10-15')
    expect(localDate(new Date('2026-10-16T02:30:00Z'), 'UTC')).toBe('2026-10-16')
  })
})

describe('matchMentionedMember', () => {
  const m = (id: string, name: string, relationship: string) => ({ id, name, relationship, pronouns: null })
  const members = [m('d', 'Danny Cho', 'Grandson'), m('l', 'Lena Cho', 'Granddaughter'), m('s', 'Sam Park', 'Son'), m('d2', 'Danny Park', 'Friend or neighbor')]

  it('matches a first name, a full name and a name with "my"', () => {
    expect(matchMentionedMember('Sam', members)).toEqual({ kind: 'one', member: members[2] })
    expect(matchMentionedMember('lena cho', members)).toEqual({ kind: 'one', member: members[1] })
  })
  it('returns every member who shares the name', () => {
    expect(matchMentionedMember('Danny', members)).toEqual({ kind: 'several', members: [members[0], members[3]] })
  })
  it('resolves a relationship word, and a shared one gives several', () => {
    expect(matchMentionedMember('my son', members)).toEqual({ kind: 'one', member: members[2] })
    expect(matchMentionedMember('my grandchild', members)).toMatchObject({ kind: 'several' })
  })
  it('finds no one for an unknown or empty mention', () => {
    expect(matchMentionedMember('Priya', members)).toEqual({ kind: 'none' })
    expect(matchMentionedMember(null, members)).toEqual({ kind: 'none' })
    expect(matchMentionedMember('  ', members)).toEqual({ kind: 'none' })
  })
})

describe('activity (the push title phrase)', () => {
  const activityOf = (activity: unknown) => {
    const r = parse(idea({ activity }))
    return r.ok ? r.ideas[0]?.activity : 'refused'
  }

  it('keeps a short verb phrase, capitalised and without end punctuation', () => {
    expect(activityOf('bake apple pie.')).toBe('Bake apple pie')
    expect(activityOf('  Bring   extra tomatoes ')).toBe('Bring extra tomatoes')
  })

  it.each([undefined, null, '', 42, 'x'.repeat(41)])('drops an unusable activity (%j) but keeps the idea', (activity) => {
    expect(activityOf(activity)).toBeNull()
  })

  it('never lets a health word into the push title', () => {
    expect(activityOf('Check on the sore knee')).toBeNull()
  })
})
