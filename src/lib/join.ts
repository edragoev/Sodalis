import { supabaseAdmin } from "@/lib/supabase/server";

type JoinInput = {
  seniorId: string;
  name: string;
  relationship: string;
  memberPhone?: string | null;
  pronouns?: string | null;
  reconnect?: boolean;
};

/** Creates (or reconnects) a family member for an elder. Shared by phone linking and invite links. */
export async function joinCircle({ seniorId, name, relationship, memberPhone = null, pronouns = null, reconnect = false }: JoinInput) {
  const db = supabaseAdmin();
  const { data: members } = await db.from("family_members").select("id, name").eq("senior_id", seniorId);
  const existing = members?.find((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) {
    // Same name already linked: ask "Is this you?" unless the client confirmed.
    if (!reconnect) return Response.json({ exists: true, name: existing.name }, { status: 409 });
    return Response.json({ member_id: existing.id, senior_id: seniorId, reconnected: true });
  }

  const row: Record<string, unknown> = { senior_id: seniorId, name, relationship, phone: memberPhone };
  let res = await db.from("family_members").insert(pronouns ? { ...row, pronouns } : row).select("id").single();
  // family_members.pronouns comes from a migration that may not be applied yet: join without it.
  if (res.error && pronouns && (res.error.code === "42703" || res.error.code === "PGRST204")) {
    res = await db.from("family_members").insert(row).select("id").single();
  }
  const { data, error } = res;
  if (error) {
    if (error.code === "23505") return Response.json({ exists: true, name }, { status: 409 });
    return Response.json({ error: "Could not join" }, { status: 500 });
  }
  return Response.json({ member_id: data.id, senior_id: seniorId });
}
