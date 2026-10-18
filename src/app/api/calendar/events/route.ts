import { supabaseAdmin } from "@/lib/supabase/server";
import { MAX_WINDOW_DAYS, expandEvents } from "@/lib/calendar/expand";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Imported events for a member in a window. Recurring series are expanded here, not stored.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const memberId = q.get("member_id") ?? "";
  const from = new Date(q.get("from") ?? "");
  const to = new Date(q.get("to") ?? "");
  if (!UUID.test(memberId)) return Response.json({ error: "member_id is required." }, { status: 400 });
  if (isNaN(+from) || isNaN(+to) || to <= from) return Response.json({ error: "from and to must be ISO dates, with to after from." }, { status: 400 });
  if (+to - +from > MAX_WINDOW_DAYS * 86_400_000) return Response.json({ error: `The window can be at most ${MAX_WINDOW_DAYS} days.` }, { status: 400 });

  // Series and overrides are always loaded: a moved instance can sit outside the window but still hide its original.
  const { data, error } = await supabaseAdmin()
    .from("calendar_events")
    .select("id, uid, recurrence_id, title, notes, starts_at, ends_at, all_day, rrule, exdates, source_tz")
    .eq("member_id", memberId)
    .or(`rrule.not.is.null,recurrence_id.not.is.null,and(starts_at.lt.${to.toISOString()},ends_at.gte.${from.toISOString()})`)
    .limit(5000);
  if (error) return Response.json({ error: "Could not load events" }, { status: 500 });

  return Response.json({ events: expandEvents(data ?? [], from, to) });
}
