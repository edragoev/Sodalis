import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  if (!rateLimit(`lookup:${clientIp(req)}`)) {
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const { phone } = await req.json().catch(() => ({}));
  const e164 = normalizePhone(phone);
  if (!e164) return Response.json({ error: "That doesn't look like a valid mobile number." }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("seniors").select("name").eq("phone_e164", e164).maybeSingle();
  if (error) return Response.json({ error: "Lookup failed" }, { status: 500 });
  if (!data) return Response.json({ found: false });
  // First name only, by design.
  return Response.json({ found: true, senior_first_name: data.name.split(" ")[0] });
}
