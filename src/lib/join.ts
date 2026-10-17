import { supabaseAdmin } from "@/lib/supabase/server";

type JoinInput = {
  seniorId: string;
  name: string;
  relationship: string;
  memberPhone?: string | null;
  reconnect?: boolean;
};

/** Creates (or reconnects) a family member for an elder. Shared by phone linking and invite links. */
export async function joinCircle({ seniorId, name, relationship, memberPhone = null, reconnect = false }: JoinInput) {
  const db = supabaseAdmin();
  const { data: members } = await db.from("family_members").select("id, name").eq("senior_id", seniorId);
  const existing = members?.find((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) {
    // Same name already linked: ask "Is this you?" unless the client confirmed.
    if (!reconnect) return Response.json({ exists: true, name: existing.name }, { status: 409 });
    return Response.json({ member_id: existing.id, senior_id: seniorId, reconnected: true });
  }

  const { data, error } = await db
    .from("family_members")
    .insert({ senior_id: seniorId, name, relationship, phone: memberPhone })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return Response.json({ exists: true, name }, { status: 409 });
    return Response.json({ error: "Could not join" }, { status: 500 });
  }
  return Response.json({ member_id: data.id, senior_id: seniorId });
}
