import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getTestEnv } from './env'

let admin: SupabaseClient | undefined
let anon: SupabaseClient | undefined

const opts = { auth: { persistSession: false, autoRefreshToken: false } }

/** Service-role client: bypasses RLS, like the Next.js API routes. */
export function adminClient(): SupabaseClient {
  const env = getTestEnv()
  return (admin ??= createClient(env.url, env.serviceRoleKey, opts))
}

/** Anon client: subject to RLS, like the dashboard. */
export function anonClient(): SupabaseClient {
  const env = getTestEnv()
  return (anon ??= createClient(env.url, env.anonKey, opts))
}
