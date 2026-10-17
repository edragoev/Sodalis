import { describe, expect, it } from 'vitest'
import { buildShortlist, interestOrSkill, type ShortlistMember, type ShortlistOpportunity } from '@/lib/coordinator/shortlist'

// Code picks the candidates before Gemini sees anything (specs/08-agents/coordinator-agent.md "Shortlist",
// specs/06-notifications/conversation-to-visit.md section 4, specs/07-onboarding/member-questionnaire.md section 5).

const member = (id: string, over: Partial<ShortlistMember> = {}): ShortlistMember => ({
  id,
  name: id,
  relationship: 'grandchild',
  interests: [],
  skills: [],
  activities_with_elder: [],
  conversation_topics: [],
  constraints: {},
  profile_summary: null,
  ...over,
})

const opportunity = (over: Partial<ShortlistOpportunity> = {}): ShortlistOpportunity => ({
  id: 'opp-1',
  type: 'activity',
  interest_tags: ['gardening', 'cooking'],
  mentioned_member_id: null,
  ...over,
})

describe('interestOrSkill', () => {
  it('weighs 0.6 activities with the elder, 0.25 interests and skills, 0.15 conversation topics', () => {
    const m = member('a', { activities_with_elder: ['cooking', 'gardening'], interests: ['cooking', 'gardening'] })
    expect(interestOrSkill(opportunity(), m)).toBeCloseTo(0.85)
  })

  it('counts the share of the opportunity tags a member covers', () => {
    const m = member('a', { activities_with_elder: ['gardening'] })
    expect(interestOrSkill(opportunity(), m)).toBeCloseTo(0.3) // half of the tags, times 0.6
  })

  it('treats skills like interests', () => {
    const m = member('a', { skills: ['cooking', 'gardening'] })
    expect(interestOrSkill(opportunity(), m)).toBeCloseTo(0.25)
  })

  it('gives a member with no profile a neutral 0.5', () => {
    expect(interestOrSkill(opportunity(), member('a'))).toBe(0.5)
  })

  it('gives 0 to a member with a profile that shares nothing', () => {
    expect(interestOrSkill(opportunity(), member('a', { interests: ['chess'] }))).toBe(0)
  })

  it('ignores case and surrounding spaces', () => {
    const m = member('a', { activities_with_elder: [' Cooking ', 'GARDENING'] })
    expect(interestOrSkill(opportunity(), m)).toBeCloseTo(0.6)
  })

  it('falls back to the mentioned item when the opportunity has no tags', () => {
    const m = member('a', { activities_with_elder: ['zucchini'] })
    expect(interestOrSkill(opportunity({ interest_tags: [], mentioned_item: 'zucchini' }), m)).toBeCloseTo(0.6)
  })
})

describe('buildShortlist', () => {
  const danny = member('danny', { activities_with_elder: ['cooking', 'gardening'], interests: ['cooking'] })
  const maya = member('maya', { interests: ['gardening'] })
  const sam = member('sam', { activities_with_elder: ['cooking'] })
  const lena = member('lena', { interests: ['chess'] })

  it('a named member is the whole shortlist, however low the match', () => {
    const list = buildShortlist(opportunity({ mentioned_member_id: 'lena' }), [danny, maya, sam, lena])
    expect(list.map((m) => m.id)).toEqual(['lena'])
  })

  it('treats a name that is not in the family as unnamed', () => {
    const list = buildShortlist(opportunity({ mentioned_member_id: 'ghost' }), [danny, lena])
    expect(list.map((m) => m.id)).toEqual(['danny'])
  })

  it('with no name, keeps the top 3 above 0.4, best first', () => {
    // match = 0.5·interest_or_skill + 0.3·0.5 + 0.2·0.5 when fit and availability are unknown
    const ann = member('ann', { activities_with_elder: ['cooking', 'gardening'], conversation_topics: ['cooking', 'gardening'] })
    const kit = member('kit', { activities_with_elder: ['cooking', 'gardening'] })
    const pat = member('pat', { activities_with_elder: ['cooking'], interests: ['cooking', 'gardening'] })
    const list = buildShortlist(opportunity(), [lena, maya, pat, kit, danny, ann])
    expect(list.map((m) => m.id)).toEqual(['ann', 'danny', 'kit'])
  })

  it('does not include a member at or below 0.4 while others qualify', () => {
    const list = buildShortlist(opportunity(), [danny, lena])
    expect(list.map((m) => m.id)).toEqual(['danny'])
  })

  it('goes to everyone when nobody scores above 0.4', () => {
    const list = buildShortlist(opportunity(), [lena, member('kit', { interests: ['chess'] })])
    expect(list.map((m) => m.id).sort()).toEqual(['kit', 'lena'])
  })

  it('goes to everyone when nobody has a profile', () => {
    const list = buildShortlist(opportunity(), [member('a'), member('b')])
    expect(list.map((m) => m.id).sort()).toEqual(['a', 'b'])
  })

  it('keeps a member with no profile eligible next to members who have one', () => {
    const list = buildShortlist(opportunity(), [member('blank'), lena])
    expect(list.map((m) => m.id)).toEqual(['blank'])
  })

  it('lets relationship fit and availability break a tie on interest', () => {
    const a = member('a', { activities_with_elder: ['cooking', 'gardening'], relationship_fit: 0.2, availability: 0.2 })
    const b = member('b', { activities_with_elder: ['cooking', 'gardening'], relationship_fit: 0.9, availability: 0.9 })
    expect(buildShortlist(opportunity(), [a, b]).map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('does not drop anyone for their constraints', () => {
    const noCar = member('nocar', { activities_with_elder: ['cooking', 'gardening'], constraints: { can_drive: false } })
    const list = buildShortlist(opportunity({ type: 'gift_errand' }), [noCar, maya])
    expect(list.map((m) => m.id)).toEqual(['nocar'])
  })

  it('returns an empty list for a family with no members', () => {
    expect(buildShortlist(opportunity(), [])).toEqual([])
  })

  it('does not change the list it was given', () => {
    const members = [maya, danny]
    buildShortlist(opportunity(), members)
    expect(members.map((m) => m.id)).toEqual(['maya', 'danny'])
  })
})
