import type { CountryCode } from "libphonenumber-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/rateLimit";

// Demo-only: creates a new elder.
export async function POST(req: Request) {
  if (!rateLimit(`elders:${clientIp(req)}`, 5)) {
    return Response.json({ error: "Too many attempts." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const timezone = String(body.timezone ?? "").trim() || "America/New_York";
  const region = (process.env.DEFAULT_PHONE_REGION || "US") as CountryCode;
  const e164 = normalizePhone(body.phone, region);
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
  if (!e164) return Response.json({ error: "That doesn't look like a valid mobile number." }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("seniors").insert({ name, phone_e164: e164, timezone }).select("id, name").single();
  if (error) {
    const dup = error.code === "23505";
    return Response.json({ error: dup ? "That number is already set up." : "Could not create elder" }, { status: dup ? 409 : 500 });
  }
  return Response.json({ senior_id: data.id, senior_first_name: data.name.split(" ")[0] });
}
