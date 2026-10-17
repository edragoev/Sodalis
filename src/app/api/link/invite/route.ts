import { supabaseAdmin } from "@/lib/supabase/server";
import { makeInviteToken } from "@/lib/invite";

// Returns the invite token for the family a member belongs to. No auth in the demo:
// the member id (a random uuid held in the member's browser) is the credential.
export async function GET(req: Request) {
  const memberId = new URL(req.url).searchParams.get("member_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return Response.json({ error: "Invalid member." }, { status: 400 });
  const { data } = await supabaseAdmin().from("family_members").select("senior_id").eq("id", memberId).maybeSingle();
  if (!data) return Response.json({ error: "Member not found." }, { status: 404 });
  return Response.json({ token: makeInviteToken(data.senior_id) });
}
