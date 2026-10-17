import type { SupabaseClient } from '@supabase/supabase-js'
import { isDeadTokenError } from '@/lib/firebase/dead-token'
import type { MulticastMessaging } from '@/lib/firebase/opportunity-push'
import { deliveryOptions, type PushMessageBody } from '@/lib/firebase/push-message'
import { clearDeadTokens } from '@/lib/firebase/token-cleanup'
import type { PushContent } from './run'

// The coordinator writes the title and body itself (specs/08-agents/coordinator-agent.md), so this push
// sends those words as they are. Tapping it opens /opportunities/[id].

// FCM accepts at most 500 tokens per multicast call.
const MAX_TOKENS_PER_CALL = 500

export function buildCoordinatorPush(content: PushContent, appUrl?: string | null): PushMessageBody {
  const priority = content.urgency === 'high' ? 'high' : 'normal'
  return {
    notification: { title: content.title, body: content.body },
    // FCM data values must be strings.
    data: {
      opportunity_id: content.opportunity_id,
      slot_ids: content.slot_ids.join(','),
      urgency: content.urgency,
    },
    ...deliveryOptions(priority, appUrl, `/opportunities/${encodeURIComponent(content.opportunity_id)}`),
  }
}

type Deps = { db: SupabaseClient; messaging: MulticastMessaging; appUrl?: string | null }

/**
 * Pushes the coordinator's message to the given members' devices, then clears any token Firebase reports
 * dead. A cleanup failure never hides the send result, because the push has already gone out.
 */
export async function pushContentToMembers({ db, messaging, appUrl }: Deps, memberIds: string[], content: PushContent) {
  const result = { successCount: 0, failureCount: 0, clearedCount: 0, cleanupFailed: false }
  if (memberIds.length === 0) return result

  const { data, error } = await db.from('family_members').select('fcm_token').in('id', memberIds)
  // Generic message on purpose: a database error could quote a token, which is a credential.
  if (error) throw new Error('Could not load push tokens')

  const tokens = [
    ...new Set((data ?? []).map((m: { fcm_token: string | null }) => m.fcm_token).filter((t): t is string => !!t)),
  ]
  if (tokens.length === 0) return result

  const message = buildCoordinatorPush(content, appUrl)
  const dead: string[] = []
  for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_CALL) {
    const batch = tokens.slice(i, i + MAX_TOKENS_PER_CALL)
    const response = await messaging.sendEachForMulticast({ ...message, tokens: batch })
    result.successCount += response.successCount
    result.failureCount += response.failureCount
    response.responses.forEach((r, index) => {
      if (!r.success && isDeadTokenError(r.error)) dead.push(batch[index])
    })
  }

  if (dead.length > 0) {
    try {
      result.clearedCount = await clearDeadTokens(db, dead)
    } catch {
      result.cleanupFailed = true
    }
  }
  return result
}
