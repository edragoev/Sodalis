import type { SupabaseClient } from '@supabase/supabase-js'

// Keep each query's URL small: the tokens go into an `in (...)` filter.
const BATCH_SIZE = 200

/**
 * Clears tokens that Firebase said will never work again, so we stop sending to them.
 * Returns how many members were cleared.
 */
export async function clearDeadTokens(db: SupabaseClient, tokens: string[]): Promise<number> {
  // Blank tokens are dropped: matching '' could clear every member without a token.
  const distinct = [...new Set(tokens.filter((t) => t.trim() !== ''))]
  let cleared = 0
  for (let i = 0; i < distinct.length; i += BATCH_SIZE) {
    const { data, error } = await db
      .from('family_members')
      .update({ fcm_token: null })
      .in('fcm_token', distinct.slice(i, i + BATCH_SIZE))
      .select('id')
    // Generic message on purpose: the database error could quote a token, which is a credential.
    if (error) throw new Error('Could not clear dead push tokens')
    cleared += data?.length ?? 0
  }
  return cleared
}
