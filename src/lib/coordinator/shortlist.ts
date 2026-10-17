// Code picks the candidates before Gemini sees anything (specs/08-agents/coordinator-agent.md "Shortlist",
// specs/06-notifications/conversation-to-visit.md section 4).

export interface ShortlistMember {
  id: string
  name: string
  relationship: string
  interests: string[]
  skills: string[]
  activities_with_elder: string[]
  conversation_topics: string[]
  constraints: Record<string, unknown>
  profile_summary: string | null
  /** 0..1, defaults to a neutral 0.5 until something measures it. */
  relationship_fit?: number
  availability?: number
}

export interface ShortlistOpportunity {
  id: string
  type: string
  interest_tags: string[]
  mentioned_member_id: string | null
  mentioned_item?: string | null
}

const NEUTRAL = 0.5
const MIN_MATCH = 0.4 // members must score above this
const MAX_MEMBERS = 3

const norm = (tag: string) => tag.trim().toLowerCase()

const hasProfile = (m: ShortlistMember) =>
  m.interests.length + m.skills.length + m.activities_with_elder.length + m.conversation_topics.length > 0

/** The share of the opportunity's tags that appear in the list (exact match, 0..1). */
function overlap(tags: string[], list: string[]): number {
  if (tags.length === 0) return 0
  const have = new Set(list.map(norm))
  return tags.filter((t) => have.has(t)).length / tags.length
}

/** How well a member's questionnaire tags fit the opportunity (member-questionnaire section 5). */
export function interestOrSkill(opportunity: ShortlistOpportunity, member: ShortlistMember): number {
  const tags = opportunity.interest_tags.map(norm).filter(Boolean)
  if (tags.length === 0 && opportunity.mentioned_item?.trim()) tags.push(norm(opportunity.mentioned_item))
  // No profile (or nothing to compare) is neutral, so the member stays eligible.
  if (!hasProfile(member) || tags.length === 0) return NEUTRAL

  return (
    0.6 * overlap(tags, member.activities_with_elder) +
    0.25 * overlap(tags, [...member.interests, ...member.skills]) +
    0.15 * overlap(tags, member.conversation_topics)
  )
}

const match = (opportunity: ShortlistOpportunity, m: ShortlistMember) =>
  0.5 * interestOrSkill(opportunity, m) + 0.3 * (m.relationship_fit ?? NEUTRAL) + 0.2 * (m.availability ?? NEUTRAL)

/** Who to consider: the named member, else the best matches, else everyone. Best first. */
export function buildShortlist(opportunity: ShortlistOpportunity, members: ShortlistMember[]): ShortlistMember[] {
  const named = members.filter((m) => m.id === opportunity.mentioned_member_id)
  if (named.length > 0) return named

  if (!members.some(hasProfile)) return [...members]

  const scored = members
    .map((m) => ({ m, score: match(opportunity, m) }))
    .filter((s) => s.score > MIN_MATCH)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MEMBERS)
    .map((s) => s.m)
  return scored.length > 0 ? scored : [...members]
}
