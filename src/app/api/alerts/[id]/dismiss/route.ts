import { supabaseAdmin } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/alerts/[id]/dismiss { member_id }: the X on a dashboard alert. Marks it acknowledged by
// that member, which hides it for the whole family (the dashboard shows unacknowledged alerts only).
// The browser can't write to the database, so this runs with the service role and checks that the
// member belongs to the alert's family.
export async function POST(req: Request, ctx: RouteContext<"/api/alerts/[id]/dismiss">) {
  const { id } = await ctx.params;
  const { member_id: memberId } = await req.json().catch(() => ({}));
  if (!UUID.test(id) || typeof memberId !== "string" || !UUID.test(memberId)) {
    return Response.json({ error: "An alert id and member_id are required." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const [alert, member] = await Promise.all([
    db.from("alerts").select("senior_id, acknowledged_by").eq("id", id).maybeSingle(),
    db.from("family_members").select("senior_id").eq("id", memberId).maybeSingle(),
  ]);
  if (alert.error || member.error) return Response.json({ error: "Could not dismiss the alert." }, { status: 500 });
  if (!alert.data) return Response.json({ error: "Alert not found." }, { status: 404 });
  if (!member.data || member.data.senior_id !== alert.data.senior_id) {
    return Response.json({ error: "That alert belongs to another family." }, { status: 403 });
  }
  // Someone in the family already dismissed it: nothing to change.
  if (alert.data.acknowledged_by) return Response.json({ ok: true });

  const { error } = await db.from("alerts").update({ acknowledged_by: memberId }).eq("id", id).is("acknowledged_by", null);
  if (error) return Response.json({ error: "Could not dismiss the alert." }, { status: 500 });
  return Response.json({ ok: true });
}
