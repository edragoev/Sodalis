import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendOpportunityPush,
  type MulticastMessaging,
  type PushOpportunity,
  type PushSlot,
} from './opportunity-push'
import { clearDeadTokens } from './token-cleanup'

type Deps = { db: SupabaseClient; messaging: MulticastMessaging }

/**
 * Pushes an opportunity to the given members, then clears any token Firebase reports dead.
 * A cleanup failure never hides the send result: the push has already gone out.
 */
export async function pushToMembers(
  { db, messaging }: Deps,
  memberIds: string[],
  opportunity: PushOpportunity,
  slots: PushSlot[],
  timezone: string,
) {
  const none = { successCount: 0, failureCount: 0, clearedCount: 0, cleanupFailed: false }
  if (memberIds.length === 0) return none

  const { data, error } = await db.from('family_members').select('fcm_token').in('id', memberIds)
  if (error) throw new Error('Could not load push tokens')

  const tokens = [
    ...new Set((data ?? []).map((m: { fcm_token: string | null }) => m.fcm_token).filter((t): t is string => !!t)),
  ]
  if (tokens.length === 0) return none

  const { successCount, failureCount, invalidTokens } = await sendOpportunityPush(
    messaging,
    tokens,
    opportunity,
    slots,
    timezone,
  )

  let clearedCount = 0
  let cleanupFailed = false
  if (invalidTokens.length > 0) {
    try {
      clearedCount = await clearDeadTokens(db, invalidTokens)
    } catch {
      cleanupFailed = true
    }
  }
  return { successCount, failureCount, clearedCount, cleanupFailed }
}
