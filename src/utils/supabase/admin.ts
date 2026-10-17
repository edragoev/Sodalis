import { createClient } from '@supabase/supabase-js'

/** Service-role client. Server only: it bypasses RLS, so never import it from client code. */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
