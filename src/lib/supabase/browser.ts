import { createClient } from "@supabase/supabase-js";

// Anon client: SELECT-only via RLS, used for realtime subscriptions.
export const supabaseBrowser = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    throw new Error(
      `Supabase browser client is missing ${missing.join(" and ")}. Add it to .env.local and restart the dev server.`,
    );
  }

  return createClient(url, anonKey);
};
