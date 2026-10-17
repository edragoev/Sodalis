import { supabaseAdmin } from "@/lib/supabase/server";
import { parseInviteToken } from "@/lib/invite";
import { clientIp, rateLimit } from "@/lib/rateLimit";

// Resolves an invite link to the elder's first name (nothing else).
export async function GET(req: Request, ctx: RouteContext<"/api/invite/[token]">) {
  if (!rateLimit(`invite:${clientIp(req)}`, 20)) {
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const { token } = await ctx.params;
  const seniorId = parseInviteToken(token);
  if (!seniorId) return Response.json({ error: "This invite link isn't valid." }, { status: 404 });
  const { data } = await supabaseAdmin().from("seniors").select("name").eq("id", seniorId).maybeSingle();
  if (!data) return Response.json({ error: "This invite link isn't valid." }, { status: 404 });
  return Response.json({ senior_first_name: data.name.split(" ")[0] });
}
