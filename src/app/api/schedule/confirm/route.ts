import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeSlots, slotEnd } from "@/lib/opportunities";
import { clientIp, rateLimit } from "@/lib/rateLimit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A member confirms one slot of an opportunity. First accept wins (specs/06, section 7):
// the status flips with a single conditional UPDATE, so two simultaneous taps can't both win.
export async function POST(req: Request) {
  if (!rateLimit(`confirm:${clientIp(req)}`, 20)) {
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const { opportunity_id: oppId, slot_id: slotId, member_id: memberId } = body as Record<string, string>;
  if (!UUID.test(String(oppId)) || !UUID.test(String(memberId)) || !slotId) {
    return Response.json({ error: "opportunity_id, slot_id and member_id are required." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const [{ data: opp }, { data: member }] = await Promise.all([
    db.from("opportunities").select("id, senior_id, status, proposed_slots, suggested_kind, accepted_by").eq("id", oppId).maybeSingle(),
    db.from("family_members").select("id, senior_id").eq("id", memberId).maybeSingle(),
  ]);
  if (!opp) return Response.json({ error: "Opportunity not found." }, { status: 404 });
  if (!member || member.senior_id !== opp.senior_id) {
    return Response.json({ error: "You're not part of this family's circle." }, { status: 403 });
  }

  const slot = normalizeSlots(opp.proposed_slots).find((s) => s.id === slotId);
  if (!slot) return Response.json({ error: "That time isn't offered." }, { status: 400 });
  if (slot.member_id && slot.member_id !== memberId) {
    return Response.json({ error: "That time was suggested for someone else." }, { status: 403 });
  }
  if (Date.parse(slot.starts_at) < Date.now()) {
    return Response.json({ error: "That time has already passed." }, { status: 400 });
  }

  // Atomic claim: only a still-proposed opportunity can be won.
  const { data: won, error: claimError } = await db
    .from("opportunities")
    .update({ status: "confirmed", accepted_by: memberId })
    .eq("id", oppId)
    .eq("status", "proposed")
    .select("id")
    .maybeSingle();
  if (claimError) return Response.json({ error: "Could not confirm. Please try again." }, { status: 500 });

  if (!won) {
    // Someone else got there first (or it's no longer open). Say who, if we can.
    const { data: now } = await db.from("opportunities").select("status, accepted_by").eq("id", oppId).maybeSingle();
    if (now?.status === "confirmed" && now.accepted_by === memberId) {
      return Response.json({ ok: true, already: true });
    }
    let coveredBy: string | null = null;
    if (now?.status === "confirmed" && now.accepted_by) {
      const { data: who } = await db.from("family_members").select("name").eq("id", now.accepted_by).maybeSingle();
      coveredBy = who?.name ?? null;
    }
    return Response.json({ error: "Already covered.", status: now?.status ?? "expired", covered_by: coveredBy }, { status: 409 });
  }

  const kind = slot.kind ?? (opp.suggested_kind === "call" ? "call" : "visit");
  const { data: visit, error: visitError } = await db
    .from("visits")
    .insert({
      senior_id: opp.senior_id,
      member_id: memberId,
      kind,
      starts_at: slot.starts_at,
      ends_at: slotEnd(slot, kind),
      status: "confirmed",
      opportunity_id: oppId,
    })
    .select("id")
    .single();
  if (visitError) {
    // Give the opportunity back so someone can still take it.
    await db.from("opportunities").update({ status: "proposed", accepted_by: null }).eq("id", oppId).eq("accepted_by", memberId);
    return Response.json({ error: "Could not save the visit. Please try again." }, { status: 500 });
  }
  return Response.json({ ok: true, visit_id: visit.id, starts_at: slot.starts_at, kind });
}
