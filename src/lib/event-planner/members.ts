import type { PlannerMember } from './types'

// "Danny" or "my grandchild" -> the family member the elder means (specs/06-notifications section 4).

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

// Words an elder uses for a relationship, mapped to the stored relationship (lowercase).
// "my kids" or "the children" matches every child, which comes back as several (never silently one of them).
const CHILD = ['child', 'children', 'kid', 'kids']
const GRANDCHILD = ['grandchild', 'grandchildren', 'grandkid', 'grandkids']
const ALIASES: Record<string, string[]> = {
  daughter: ['daughter', 'daughters', ...CHILD],
  son: ['son', 'sons', ...CHILD],
  granddaughter: ['granddaughter', 'granddaughters', ...GRANDCHILD],
  grandson: ['grandson', 'grandsons', ...GRANDCHILD],
  'niece or nephew': ['niece', 'nephew'],
  'friend or neighbor': ['friend', 'neighbor', 'neighbour'],
}

const relationshipWords = (relationship: string): string[] => {
  const key = norm(relationship)
  return [...(ALIASES[key] ?? []), key]
}

export type MemberMatch =
  | { kind: 'none' }
  | { kind: 'one'; member: PlannerMember }
  | { kind: 'several'; members: PlannerMember[] }

/**
 * Matches a spoken name to members: first name, full name, or a relationship word ("my grandchild").
 * A name wins over a relationship. Several matches are returned as they are, never silently picked from.
 */
export function matchMentionedMember(mention: string | null, members: PlannerMember[]): MemberMatch {
  const said = norm(mention ?? '').replace(/^(?:my|our|the)\s+/, '')
  if (!said) return { kind: 'none' }

  const byName = members.filter((m) => {
    const full = norm(m.name)
    return full === said || full.split(' ')[0] === said
  })
  const hits = byName.length > 0 ? byName : members.filter((m) => relationshipWords(m.relationship).includes(said))

  if (hits.length === 0) return { kind: 'none' }
  return hits.length === 1 ? { kind: 'one', member: hits[0] } : { kind: 'several', members: hits }
}
