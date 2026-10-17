import { supabaseAdmin } from "@/lib/supabase/server";
import { QUESTION_KEYS, loadProfile, restructureMember } from "@/lib/profile";
import { logisticsConstraints, parseLogistics } from "@/lib/logistics";

export async function GET(_req: Request, ctx: RouteContext<"/api/members/[id]/profile">) {
  const { id } = await ctx.params;
  // Retry structuring if a previous attempt failed (no-op when nothing is pending).
  await restructureMember(id);
  const profile = await loadProfile(id);
  if (!profile) return Response.json({ error: "Member not found" }, { status: 404 });
  return Response.json(profile);
}

export async function PUT(req: Request, ctx: RouteContext<"/api/members/[id]/profile">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const incoming = (body.answers ?? {}) as Record<string, unknown>;

  const db = supabaseAdmin();
  const { data: member } = await db.from("family_members").select("id").eq("id", id).maybeSingle();
  if (!member) return Response.json({ error: "Member not found" }, { status: 404 });

  const { data: existing } = await db
    .from("member_profile_answers").select("question_key, answer_text").eq("member_id", id);
  const current = Object.fromEntries((existing ?? []).map((r) => [r.question_key, r.answer_text]));

  const upserts: { member_id: string; question_key: string; answer_text: string; updated_at: string }[] = [];
  const removals: string[] = [];
  for (const key of QUESTION_KEYS) {
    if (!(key in incoming)) continue;
    const text = String(incoming[key] ?? "").trim().slice(0, 2000);
    if (text === (current[key] ?? "")) continue; // unchanged: keep updated_at so manual tags survive
    if (text) upserts.push({ member_id: id, question_key: key, answer_text: text, updated_at: new Date().toISOString() });
    else removals.push(key);
  }

  if (upserts.length) {
    const { error } = await db.from("member_profile_answers").upsert(upserts, { onConflict: "member_id,question_key" });
    if (error) return Response.json({ error: "Could not save answers" }, { status: 500 });
  }
  if (removals.length) {
    await db.from("member_profile_answers").delete().eq("member_id", id).in("question_key", removals);
  }

  // Exact travel facts from the logistics taps are saved now, so they survive a Gemini failure.
  const logisticsChanged = upserts.some((u) => u.question_key === "logistics") || removals.includes("logistics");
  if (logisticsChanged) {
    const parsed = parseLogistics(String(incoming.logistics ?? "").trim());
    if (parsed) {
      await db.from("family_members").update({ constraints: logisticsConstraints(parsed) }).eq("id", id);
    }
  }

  const structuring = await restructureMember(id);
  const profile = await loadProfile(id);
  return Response.json({ ...profile, structuring });
}
