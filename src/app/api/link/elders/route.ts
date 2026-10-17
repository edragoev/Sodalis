import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/rateLimit";

// Demo-only: creates a new elder from the profile a family member fills in.
const tags = (v: unknown) =>
  Array.isArray(v)
    ? [...new Set(v.map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 20)
    : [];

function validBirthday(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) || t > Date.now() || t < Date.parse("1900-01-01") ? null : v;
}

export async function POST(req: Request) {
  if (!rateLimit(`elders:${clientIp(req)}`, 5)) {
    return Response.json({ error: "Too many attempts." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80);
  const timezone = String(body.timezone ?? "").trim() || "America/New_York";
  const pronouns = String(body.pronouns ?? "").trim().slice(0, 30) || null;
  const birthday = body.birthday ? validBirthday(body.birthday) : null;
  const notes = String(body.notes ?? "").trim().slice(0, 2000) || null;
  const e164 = normalizePhone(body.phone);
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
  if (!e164) return Response.json({ error: "That doesn't look like a valid mobile number." }, { status: 400 });
  if (body.birthday && !birthday) return Response.json({ error: "That birthday doesn't look right." }, { status: 400 });

  const core = { name, phone_e164: e164, timezone, notes };
  const attempts: Record<string, unknown>[] = [
    { ...core, pronouns, birthday, interests: tags(body.interests), skills: tags(body.skills) },
    // The newer columns come from migrations that may not be applied yet: save what we can.
    { ...core, pronouns },
    core,
  ];
  const db = supabaseAdmin();
  let res = await db.from("seniors").insert(attempts[0]).select("id, name").single();
  for (let i = 1; i < attempts.length && res.error && ["42703", "PGRST204"].includes(res.error.code); i++) {
    res = await db.from("seniors").insert(attempts[i]).select("id, name").single();
  }
  if (res.error) {
    const dup = res.error.code === "23505";
    return Response.json({ error: dup ? "That number is already set up." : "Could not create the profile" }, { status: dup ? 409 : 500 });
  }
  return Response.json({ senior_id: res.data.id, senior_first_name: res.data.name.split(" ")[0] });
}
