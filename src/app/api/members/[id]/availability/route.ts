import { supabaseAdmin } from "@/lib/supabase/server";
import { validateWindows } from "@/lib/availability";

export async function GET(_req: Request, ctx: RouteContext<"/api/members/[id]/availability">) {
  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin().from("family_members").select("manual_availability").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: "Could not load availability" }, { status: 500 });
  if (!data) return Response.json({ error: "Member not found" }, { status: 404 });
  return Response.json({ windows: data.manual_availability ?? [] });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/members/[id]/availability">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const problem = validateWindows(body.windows);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const windows = (body.windows as { dow: number; start: string; end: string }[]).map(({ dow, start, end }) => ({ dow, start, end }));
  const { data, error } = await supabaseAdmin()
    .from("family_members").update({ manual_availability: windows }).eq("id", id).select("id").maybeSingle();
  if (error) return Response.json({ error: "Could not save availability" }, { status: 500 });
  if (!data) return Response.json({ error: "Member not found" }, { status: 404 });
  return Response.json({ windows });
}
