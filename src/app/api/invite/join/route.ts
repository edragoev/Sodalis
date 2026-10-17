import { parseInviteToken } from "@/lib/invite";
import { joinCircle } from "@/lib/join";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  if (!rateLimit(`invite-join:${clientIp(req)}`)) {
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const seniorId = parseInviteToken(String(body.token ?? ""));
  if (!seniorId) return Response.json({ error: "This invite link isn't valid." }, { status: 404 });
  const name = String(body.name ?? "").trim();
  const relationship = String(body.relationship ?? "").trim();
  const pronouns = String(body.pronouns ?? "").trim().slice(0, 30) || null;
  if (!name || !relationship) return Response.json({ error: "Name and relationship are required." }, { status: 400 });
  return joinCircle({ seniorId, name, relationship, pronouns, reconnect: !!body.reconnect });
}
