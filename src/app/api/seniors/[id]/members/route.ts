import { supabaseAdmin } from "@/lib/supabase/server";
import { joinCircle } from "@/lib/join";
import { clientIp, rateLimit } from "@/lib/rateLimit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The profile picker: the family circle of one elder (first names and relationships only).
export async function GET(_req: Request, ctx: RouteContext<"/api/seniors/[id]/members">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const db = supabaseAdmin();
  const { data: senior } = await db.from("seniors").select("name").eq("id", id).maybeSingle();
  if (!senior) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: members } = await db.from("family_members").select("id, name, relationship").eq("senior_id", id).order("joined_at");
  const ids = (members ?? []).map((m) => m.id);
  const { data: answered } = ids.length
    ? await db.from("member_profile_answers").select("member_id").in("member_id", ids)
    : { data: [] as { member_id: string }[] };
  const done = new Set((answered ?? []).map((a) => a.member_id));

  return Response.json({
    senior_first_name: senior.name.split(" ")[0],
    members: (members ?? []).map((m) => ({
      id: m.id,
      name: m.name.split(" ")[0],
      relationship: m.relationship,
      has_answers: done.has(m.id),
    })),
  });
}

// Add a family profile to this elder's circle.
export async function POST(req: Request, ctx: RouteContext<"/api/seniors/[id]/members">) {
  if (!rateLimit(`add-member:${clientIp(req)}`, 10)) {
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80);
  const relationship = String(body.relationship ?? "").trim().slice(0, 60);
  const pronouns = String(body.pronouns ?? "").trim().slice(0, 30) || null;
  if (!name || !relationship) return Response.json({ error: "Name and relationship are required." }, { status: 400 });

  const { data: senior } = await supabaseAdmin().from("seniors").select("id").eq("id", id).maybeSingle();
  if (!senior) return Response.json({ error: "Not found" }, { status: 404 });
  return joinCircle({ seniorId: id, name, relationship, pronouns });
}
