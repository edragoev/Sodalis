import type { CountryCode } from "libphonenumber-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  if (!rateLimit(`join:${clientIp(req)}`)) {
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const relationship = String(body.relationship ?? "").trim();
  const region = (process.env.DEFAULT_PHONE_REGION || "US") as CountryCode;
  const e164 = normalizePhone(body.phone, region);
  const memberPhone = body.member_phone ? normalizePhone(body.member_phone, region) : null;
  if (!e164) return Response.json({ error: "Invalid elder phone number." }, { status: 400 });
  if (!name || !relationship) return Response.json({ error: "Name and relationship are required." }, { status: 400 });
  if (body.member_phone && !memberPhone) return Response.json({ error: "Your phone number looks invalid." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: senior } = await db.from("seniors").select("id").eq("phone_e164", e164).maybeSingle();
  if (!senior) return Response.json({ error: "We couldn't find that number." }, { status: 404 });

  const { data: members } = await db.from("family_members").select("id, name").eq("senior_id", senior.id);
  const existing = members?.find((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) {
    // Same name already linked: ask "Is this you?" unless the client confirmed.
    if (!body.reconnect) return Response.json({ exists: true, name: existing.name }, { status: 409 });
    return Response.json({ member_id: existing.id, senior_id: senior.id, reconnected: true });
  }

  const { data, error } = await db.from("family_members")
    .insert({ senior_id: senior.id, name, relationship, phone: memberPhone })
    .select("id").single();
  if (error) {
    if (error.code === "23505") return Response.json({ exists: true, name }, { status: 409 });
    return Response.json({ error: "Could not join" }, { status: 500 });
  }
  return Response.json({ member_id: data.id, senior_id: senior.id });
}
