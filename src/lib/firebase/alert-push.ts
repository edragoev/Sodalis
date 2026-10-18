import type { SupabaseClient } from '@supabase/supabase-js'
import { isDeadTokenError } from './dead-token'
import type { MulticastMessaging } from './opportunity-push'
import { deliveryOptions, type PushMessageBody } from './push-message'
import { clearDeadTokens } from './token-cleanup'

// The urgent push for a concern Soladis flagged during a call (specs/08-agents/hope-tools.md).
// It goes to every family member with notifications on. Tapping it opens the phone app to call
// the elder (public/sw-push.js); the click link is the dashboard for browsers that cannot dial.

// FCM accepts at most 500 tokens per multicast call.
const MAX_TOKENS_PER_CALL = 500

export interface AlertPushContent {
  seniorName: string
  seniorPhone: string
  /** What the elder said, as Soladis summarised it: "fell, can't get up". */
  detail: string
}

export function buildAlertPush(content: AlertPushContent, appUrl?: string | null): PushMessageBody<'high'> {
  const said = content.detail.trim().replace(/[.!\s]+$/, '')
  return {
    notification: {
      title: `${content.seniorName} may need help`,
      body: `"${said}." Soladis suggested calling 911. Tap to call ${content.seniorName}.`,
    },
    // FCM data values must be strings.
    data: { type: 'alert', urgency: 'high', elder_phone: content.seniorPhone },
    ...deliveryOptions('high', appUrl, '/'),
  }
}

type Deps = { db: SupabaseClient; messaging: MulticastMessaging; appUrl?: string | null }

/** Pushes the alert to all of the senior's family members with a push token, then clears dead tokens. */
export async function pushAlertToFamily({ db, messaging, appUrl }: Deps, seniorId: string, content: AlertPushContent) {
  const result = { successCount: 0, failureCount: 0, clearedCount: 0, cleanupFailed: false }

  const { data, error } = await db
    .from('family_members')
    .select('fcm_token')
    .eq('senior_id', seniorId)
    .not('fcm_token', 'is', null)
  // Generic message on purpose: a database error could quote a token, which is a credential.
  if (error) throw new Error('Could not load push tokens')

  const tokens = [
    ...new Set((data ?? []).map((m: { fcm_token: string | null }) => m.fcm_token).filter((t): t is string => !!t)),
  ]
  if (tokens.length === 0) return result

  const message = buildAlertPush(content, appUrl)
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
