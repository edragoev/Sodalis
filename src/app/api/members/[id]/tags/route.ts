import { supabaseAdmin } from "@/lib/supabase/server";
import { cleanTags, loadProfile } from "@/lib/profile";

const FIELDS = ["interests", "skills", "activities_with_elder", "conversation_topics"] as const;

// Manual tag edits. They override Gemini until a related answer changes.
export async function PUT(req: Request, ctx: RouteContext<"/api/members/[id]/tags">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, string[]> = {};
  for (const f of FIELDS) {
    if (Array.isArray(body[f])) update[f] = cleanTags(body[f].map(String));
  }
  if (!Object.keys(update).length) return Response.json({ error: "No tags provided" }, { status: 400 });

  const { error } = await supabaseAdmin().from("family_members").update(update).eq("id", id);
  if (error) return Response.json({ error: "Could not save tags" }, { status: 500 });
  return Response.json(await loadProfile(id));
}
