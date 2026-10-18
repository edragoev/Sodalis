import { supabaseAdmin } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Removes everything one upload created or updated.
export async function DELETE(req: Request, ctx: RouteContext<"/api/calendar/import/[batchId]">) {
  const { batchId } = await ctx.params;
  const memberId = new URL(req.url).searchParams.get("member_id") ?? "";
  if (!UUID.test(batchId) || !UUID.test(memberId)) return Response.json({ error: "A valid batch id and member_id are required." }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("calendar_events").delete().eq("import_batch_id", batchId).eq("member_id", memberId).select("id");
  if (error) return Response.json({ error: "Could not remove the import" }, { status: 500 });
  return Response.json({ deleted: data?.length ?? 0 });
}
