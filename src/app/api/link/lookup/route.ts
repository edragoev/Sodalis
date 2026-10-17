import type { CountryCode } from "libphonenumber-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  if (!rateLimit(`lookup:${clientIp(req)}`)) {
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const { phone } = await req.json().catch(() => ({}));
  const region = (process.env.DEFAULT_PHONE_REGION || "US") as CountryCode;
  const e164 = normalizePhone(phone, region);
  if (!e164) return Response.json({ error: "That doesn't look like a valid mobile number." }, { status: 400 });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Supabase lookup is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    return Response.json({ error: "Lookup is not configured on the server." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin()
    .from("seniors").select("id, name").eq("phone_e164", e164).maybeSingle();
  if (error) {
    console.error("Supabase senior lookup failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return Response.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!data) return Response.json({ found: false });
  // First name and id only: the id lets the profile picker load the family.
  return Response.json({ found: true, senior_id: data.id, senior_first_name: data.name.split(" ")[0] });
}
