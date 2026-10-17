import { createCheckIn, createFamilyMember, createOpportunity, createSenior } from './factories'

type Row = Record<string, unknown>

// 2026-10-15 is a Thursday; these are 4pm, 10am and 2pm Toronto time.
export const SLOTS = [
  { id: 'slot-a', starts_at: '2026-10-15T20:00:00Z' },
  { id: 'slot-b', starts_at: '2026-10-16T14:00:00Z' },
  { id: 'slot-c', starts_at: '2026-10-17T18:00:00Z' },
]

/**
 * A senior with `memberCount` family members and one opportunity that has been proposed
 * (pushed to the family with three slots), ready to be confirmed.
 */
export async function createProposedOpportunity(memberCount = 2, overrides: Row = {}) {
  const senior = await createSenior()
  const seniorId = senior.id as string
  const members: Row[] = []
  for (let i = 0; i < memberCount; i++) members.push(await createFamilyMember(seniorId, { name: `Member${i}` }))
  const checkIn = await createCheckIn(seniorId)
  const opportunity = await createOpportunity(seniorId, checkIn.id as string, {
    status: 'proposed',
    suggested_kind: 'visit',
    proposed_slots: SLOTS,
    ...overrides,
  })
  return { senior, members, checkIn, opportunity }
}
