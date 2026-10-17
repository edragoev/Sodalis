import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

// Anon client: SELECT-only via RLS, used for realtime subscriptions.
// Lazy singleton: multiple clients share one auth storage key and make
// GoTrueClient warn about concurrent instances.
export const supabaseBrowser = (): SupabaseClient =>
  (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
