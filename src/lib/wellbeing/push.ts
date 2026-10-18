import type { SupabaseClient } from '@supabase/supabase-js'
import { isDeadTokenError } from '@/lib/firebase/dead-token'
import type { MulticastMessaging } from '@/lib/firebase/opportunity-push'
import { deliveryOptions, type PushMessageBody } from '@/lib/firebase/push-message'
import { clearDeadTokens } from '@/lib/firebase/token-cleanup'
import type { Safety } from './types'

// A wellbeing push says only that there is something to look at. Nothing about the elder's health or
// feelings goes in a push (specs/06-notifications section 6); the detail stays on the call page.

const MAX_TOKENS_PER_CALL = 500

export function buildWellbeingPush(checkInId: string, level: Exclude<Safety, 'routine'>, appUrl?: string | null): PushMessageBody {
  const priority = level === 'urgent' ? 'high' : 'normal'
  return {
    notification: {
      title: level === 'urgent' ? 'Please check on your family member' : 'A note from Hope’s latest call',
      body: 'Open CareChain to read the details.',
    },
    data: { check_in_id: checkInId, safety: level },
    ...deliveryOptions(priority, appUrl, `/calls/${encodeURIComponent(checkInId)}`),
  }
}

type Deps = { db: SupabaseClient; messaging: MulticastMessaging; appUrl?: string | null }

/** Pushes to every linked family member's devices, then clears any token Firebase reports dead. */
export async function pushWellbeing({ db, messaging, appUrl }: Deps, seniorId: string, checkInId: string, level: Exclude<Safety, 'routine'>) {
  const { data, error } = await db.from('family_members').select('fcm_token').eq('senior_id', seniorId)
  // Generic message on purpose: a database error could quote a token, which is a credential.
  if (error) throw new Error('Could not load push tokens')
  const tokens = [...new Set((data ?? []).map((m: { fcm_token: string | null }) => m.fcm_token).filter((t): t is string => !!t))]
  if (tokens.length === 0) return

  const message = buildWellbeingPush(checkInId, level, appUrl)
  const dead: string[] = []
  for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_CALL) {
    const batch = tokens.slice(i, i + MAX_TOKENS_PER_CALL)
    const response = await messaging.sendEachForMulticast({ ...message, tokens: batch })
    response.responses.forEach((r, index) => {
      if (!r.success && isDeadTokenError(r.error)) dead.push(batch[index])
    })
  }
  if (dead.length > 0) await clearDeadTokens(db, dead).catch(() => 0)
}
