import { createClient } from "@supabase/supabase-js";

// Service-role client. Server only: all writes go through API routes.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}
