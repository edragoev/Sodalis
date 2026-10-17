import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { joinCircle } from "@/lib/join";

export async function POST(req: Request) {
  if (!rateLimit(`join:${clientIp(req)}`)) {
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const relationship = String(body.relationship ?? "").trim();
  const pronouns = String(body.pronouns ?? "").trim().slice(0, 30) || null;
  const e164 = normalizePhone(body.phone);
  const memberPhone = body.member_phone ? normalizePhone(body.member_phone) : null;
  if (!e164) return Response.json({ error: "Invalid elder phone number." }, { status: 400 });
  if (!name || !relationship) return Response.json({ error: "Name and relationship are required." }, { status: 400 });
  if (body.member_phone && !memberPhone) return Response.json({ error: "Your phone number looks invalid." }, { status: 400 });

  const { data: senior } = await supabaseAdmin().from("seniors").select("id").eq("phone_e164", e164).maybeSingle();
  if (!senior) return Response.json({ error: "We couldn't find that number." }, { status: 404 });

  return joinCircle({ seniorId: senior.id, name, relationship, memberPhone, pronouns, reconnect: !!body.reconnect });
}
