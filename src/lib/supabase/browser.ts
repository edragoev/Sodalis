import { createClient } from "@supabase/supabase-js";

// Anon client: SELECT-only via RLS, used for realtime subscriptions.
export const supabaseBrowser = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
