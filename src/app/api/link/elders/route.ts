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
  const pronouns = String(body.pronouns ?? "").trim().slice(0, 30) || null;
  const e164 = normalizePhone(body.phone);
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
  if (!e164) return Response.json({ error: "That doesn't look like a valid mobile number." }, { status: 400 });

  const db = supabaseAdmin();
  const row: Record<string, unknown> = { name, phone_e164: e164, timezone };
  let res = await db.from("seniors").insert(pronouns ? { ...row, pronouns } : row).select("id, name").single();
  // The pronouns column comes from a migration that may not be applied yet: save the elder without it.
  if (res.error && pronouns && (res.error.code === "42703" || res.error.code === "PGRST204")) {
    res = await db.from("seniors").insert(row).select("id, name").single();
  }
  if (res.error) {
    const dup = res.error.code === "23505";
    return Response.json({ error: dup ? "That number is already set up." : "Could not create elder" }, { status: dup ? 409 : 500 });
  }
  return Response.json({ senior_id: res.data.id, senior_first_name: res.data.name.split(" ")[0] });
}
