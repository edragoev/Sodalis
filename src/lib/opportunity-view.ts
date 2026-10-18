import type { Session } from '@/lib/session'
import { formatSlot } from '@/lib/slots'

// What /opportunities/[id] shows, decided in one pure function so every state is easy to test.
// States follow the lifecycle in specs/06-notifications/conversation-to-visit.md section 7.

export type OpportunityData = {
  opportunity: {
    id: string
    senior_id: string
    type: string
    summary: string
    quote: string | null
    mentioned_item: string | null
    urgency: string
    status: 'detected' | 'proposed' | 'confirmed' | 'declined' | 'expired'
    accepted_by: string | null
    /** Null until the coordinator proposes times. */
    proposed_slots: { id: string; starts_at: string }[] | null
  }
  members: { id: string; name: string }[]
  timezone: string
}

export type OpportunityState =
  | 'open'
  | 'preparing'
  | 'claimed'
  | 'claimed_by_me'
  | 'declined'
  | 'expired'
  | 'needs_link'
  | 'not_your_family'

export type OpportunityView = {
  state: OpportunityState
  title: string
  quote: string | null
  slots: { id: string; label: string }[]
  canConfirm: boolean
  claimedBy: string | null
}

const GENERIC_TITLE = 'A visit idea'

// Nothing from the opportunity is shown to someone who is not linked, or linked to another family.
const hidden = (state: 'needs_link' | 'not_your_family'): OpportunityView => ({
  state,
  title: GENERIC_TITLE,
  quote: null,
  slots: [],
  canConfirm: false,
  claimedBy: null,
})

export function buildOpportunityView({ opportunity, members, timezone }: OpportunityData, session: Session | null): OpportunityView {
  if (!session) return hidden('needs_link')
  if (session.senior_id !== opportunity.senior_id) return hidden('not_your_family')

  // A slot with an unreadable date is dropped rather than shown as "Invalid Date". No times yet is an empty list.
  const slots = (opportunity.proposed_slots ?? [])
    .filter((s) => !Number.isNaN(Date.parse(s.starts_at)))
    .map((s) => ({ id: s.id, label: formatSlot(s.starts_at, timezone) }))

  const subject = opportunity.mentioned_item?.trim() || opportunity.summary
  const base = {
    title: `${GENERIC_TITLE}: ${subject}`,
    quote: opportunity.quote,
    slots,
    canConfirm: false,
    claimedBy: null as string | null,
  }

  switch (opportunity.status) {
    case 'proposed':
      return { ...base, state: 'open', canConfirm: slots.length > 0 }
    case 'detected':
      return { ...base, state: 'preparing' }
    case 'confirmed': {
      if (opportunity.accepted_by === session.member_id) return { ...base, state: 'claimed_by_me' }
      const name = members.find((m) => m.id === opportunity.accepted_by)?.name
      return { ...base, state: 'claimed', claimedBy: name ?? 'someone' }
    }
    case 'declined':
      return { ...base, state: 'declined' }
    case 'expired':
      return { ...base, state: 'expired' }
    default:
      // A status this screen doesn't know must not return undefined and crash the page.
      return { ...base, state: 'preparing' }
  }
}
