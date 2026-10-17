// FCM push for a proposed opportunity (specs/06-notifications/conversation-to-visit.md, section 6).

export type PushOpportunity = {
  id: string
  summary: string
  quote?: string | null
  mentioned_item?: string | null
  urgency: 'low' | 'normal' | 'high'
}

export type PushSlot = { id: string; starts_at: string }

/** The slice of firebase-admin's Messaging that we call, so tests (and callers) can pass a fake. */
export type MulticastMessaging = {
  sendEachForMulticast(message: OpportunityPushMessage & { tokens: string[] }): Promise<{
    successCount: number
    failureCount: number
    responses: { success: boolean; error?: { code: string } }[]
  }>
}

export type OpportunityPushMessage = {
  notification: { title: string; body: string }
  data: Record<string, string>
  android: { priority: 'high' | 'normal' }
  webpush: { headers: { Urgency: 'high' | 'normal' }; fcmOptions: { link: string } }
}

// Health detail stays on the dashboard, so only a short quote goes in the push.
const MAX_QUOTE = 80

// FCM accepts at most 500 tokens per multicast call.
const MAX_TOKENS_PER_CALL = 500

// These mean the token will never work again; anything else (for example internal-error) is transient.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/** "Thu 4pm", "Fri 10:30am", in the given IANA timezone. */
export function formatSlot(startsAt: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(startsAt))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const minute = get('minute')
  const time = `${get('hour')}${minute === '00' ? '' : `:${minute}`}${get('dayPeriod').toLowerCase()}`
  return `${get('weekday')} ${time}`
}

function shorten(text: string): string {
  // Count code points, not UTF-16 units, so an emoji is never cut in half.
  const chars = Array.from(text)
  return chars.length <= MAX_QUOTE ? text : `${chars.slice(0, MAX_QUOTE - 1).join('').trimEnd()}…`
}

/** Keeps only slots with a real date; one bad slot must not sink the whole push. */
function validSlots(slots: PushSlot[]): PushSlot[] {
  return slots.filter((s) => !Number.isNaN(Date.parse(s.starts_at)))
}

/** Builds the FCM message (without recipients) for an opportunity and its proposed slots. */
export function buildOpportunityPush(
  opportunity: PushOpportunity,
  slots: PushSlot[],
  timezone: string,
): OpportunityPushMessage {
  const priority = opportunity.urgency === 'high' ? 'high' : 'normal'
  const link = `/opportunities/${opportunity.id}`
  const subject = opportunity.mentioned_item?.trim() || opportunity.summary
  slots = validSlots(slots)
  const slotText = slots.map((s) => formatSlot(s.starts_at, timezone)).join(', ')
  const quote = opportunity.quote ? `'${shorten(opportunity.quote)}'` : ''

  return {
    notification: {
      title: `A visit idea: ${subject}`,
      // FCM rejects an empty body, so fall back to the summary.
      body: [quote, slotText].filter(Boolean).join(' ') || opportunity.summary,
    },
    // FCM data values must be strings.
    data: {
      opportunity_id: opportunity.id,
      slot_ids: slots.map((s) => s.id).join(','),
      urgency: opportunity.urgency,
    },
    android: { priority },
    webpush: { headers: { Urgency: priority }, fcmOptions: { link } },
  }
}

/**
 * Sends the push to every token, in batches of 500. Returns the counts plus the tokens FCM says
 * are dead, so the caller can delete them from family_members.fcm_token.
 */
export async function sendOpportunityPush(
  messaging: MulticastMessaging,
  tokens: string[],
  opportunity: PushOpportunity,
  slots: PushSlot[],
  timezone: string,
) {
  const result = { successCount: 0, failureCount: 0, invalidTokens: [] as string[] }
  if (tokens.length === 0) return result

  const message = buildOpportunityPush(opportunity, slots, timezone)
  for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_CALL) {
    const batch = tokens.slice(i, i + MAX_TOKENS_PER_CALL)
    const response = await messaging.sendEachForMulticast({ ...message, tokens: batch })
    result.successCount += response.successCount
    result.failureCount += response.failureCount
    response.responses.forEach((r, index) => {
      if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) result.invalidTokens.push(batch[index])
    })
  }
  return result
}
