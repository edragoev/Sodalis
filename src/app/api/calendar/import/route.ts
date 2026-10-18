import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ImportError, MAX_UPLOAD_BYTES, parseUpload } from "@/lib/calendar/import";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 500;
const keyOf = (uid: string, recurrenceId: string | null) => `${uid}|${recurrenceId ? new Date(recurrenceId).toISOString() : ""}`;

// Imports a Google Calendar export (.ics or .zip). See specs/10-calendar/google-calendar-import.md.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const memberId = form?.get("member_id");
  if (!(file instanceof File)) return Response.json({ error: "Choose a .ics or .zip file." }, { status: 400 });
  if (typeof memberId !== "string" || !UUID.test(memberId)) return Response.json({ error: "member_id is required." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "That file is too large (10 MB max)." }, { status: 413 });

  const db = supabaseAdmin();
  const { data: member, error: memberError } = await db.from("family_members").select("id, seniors(timezone)").eq("id", memberId).maybeSingle();
  if (memberError) return Response.json({ error: "Could not load member" }, { status: 500 });
  if (!member) return Response.json({ error: "Member not found" }, { status: 404 });
  const senior = Array.isArray(member.seniors) ? member.seniors[0] : member.seniors;

  let parsed;
  try {
    parsed = parseUpload(new Uint8Array(await file.arrayBuffer()), senior?.timezone || "UTC");
  } catch (e) {
    if (e instanceof ImportError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: "Couldn't read that file." }, { status: 400 });
  }

  // The same UID twice in one upload would make the upsert fail; the last one wins.
  const batchId = randomUUID();
  const unique = new Map(parsed.rows.map((r) => [keyOf(r.uid, r.recurrence_id), { ...r, member_id: memberId, source: "ics_import", import_batch_id: batchId }]));
  const rows = [...unique.values()];

  const { data: existing, error: existingError } = await db.from("calendar_events").select("uid, recurrence_id").eq("member_id", memberId);
  if (existingError) return Response.json({ error: "Could not save the calendar" }, { status: 500 });
  const known = new Set((existing ?? []).map((e: { uid: string; recurrence_id: string | null }) => keyOf(e.uid, e.recurrence_id)));
  const updated = rows.filter((r) => known.has(keyOf(r.uid, r.recurrence_id))).length;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("calendar_events").upsert(rows.slice(i, i + CHUNK), { onConflict: "member_id,uid,recurrence_id" });
    if (error) return Response.json({ error: "Could not save the calendar" }, { status: 500 });
  }

  return Response.json({
    batch_id: batchId,
    imported: rows.length - updated,
    updated,
    skipped: parsed.errors.length,
    errors: parsed.errors.slice(0, 20),
  });
}
