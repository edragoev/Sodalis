"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fromWindows } from "@/lib/availability";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getSession } from "@/lib/session";
import { Screen, TabBar, headingCls, subCls } from "./ui";

type Visit = { id: string; kind: "visit" | "call"; starts_at: string; status: string; member_id: string };

const dayHeading = (d: Date, today: Date) => {
  const tomorrow = new Date(today.getTime() + 864e5);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

// The Calendar tab: every visit and call coming up, grouped by day, plus a summary of
// the member's own free times (edited on the Availability page, reached from here).
export default function Schedule() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [seniorName, setSeniorName] = useState("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [freeSlots, setFreeSlots] = useState<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    queueMicrotask(() => setName(s.name?.split(" ")[0] ?? ""));
    fetch(`/api/members/${s.member_id}/availability`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => setFreeSlots(d ? fromWindows(d.windows).size : null));
    let db: ReturnType<typeof supabaseBrowser>;
    try {
      db = supabaseBrowser();
    } catch {
      return void queueMicrotask(() => setError("Couldn't load the calendar."));
    }
    Promise.all([
      db.from("seniors").select("name").eq("id", s.senior_id).maybeSingle(),
      db.from("visits").select("id, kind, starts_at, status, member_id")
        .eq("senior_id", s.senior_id).in("status", ["proposed", "confirmed"]).gte("starts_at", today.toISOString())
        .order("starts_at").limit(60),
      db.from("family_members").select("id, name").eq("senior_id", s.senior_id),
    ]).then(([sen, v, m]) => {
      if (v.error) return setError("Couldn't load the calendar.");
      setSeniorName(sen.data?.name?.split(" ")[0] ?? "");
      setVisits((v.data ?? []) as Visit[]);
      setNames(Object.fromEntries((m.data ?? []).map((x) => [x.id, x.name.split(" ")[0]])));
      setNow(new Date());
    });
  }, [router]);

  if (error) return <p role="alert" className="p-8 text-danger">{error}</p>;
  if (!now) return <p className="p-8 text-slate">Loading…</p>;

  const sName = seniorName || "your loved one";
  const days: { key: string; date: Date; items: Visit[] }[] = [];
  for (const v of visits) {
    const date = new Date(v.starts_at);
    const key = date.toDateString();
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(v);
    else days.push({ key, date, items: [v] });
  }
  const card = "rounded-3xl border border-sand bg-white p-5";

  return (
    <Screen tabs={<TabBar active="calendar" name={name} />}>
      <h1 className={headingCls}>Calendar</h1>
      <p className={subCls}>Visits and calls with {sName}.</p>

      <section className={`${card} mt-6 flex items-center justify-between gap-4`}>
        <div>
          <p className="font-semibold text-ink">Your free times</p>
          <p className="text-sm text-slate">
            {freeSlots == null ? "Couldn't load them." : freeSlots === 0 ? "Not set yet." : `${freeSlots} two-hour windows a week.`}
          </p>
        </div>
        <Link href="/availability" className="inline-flex h-10 shrink-0 items-center rounded-full bg-btn px-4 text-sm font-semibold text-primary-dark hover:bg-btn-hover">
          {freeSlots ? "Edit" : "Set"}
        </Link>
      </section>

      <div className="mt-6 space-y-6">
        {days.length ? (
          days.map((day) => (
            <section key={day.key} className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-ink">{dayHeading(day.date, now)}</h2>
              {day.items.map((v) => (
                <div key={v.id} className={`${card} flex items-center justify-between py-4`}>
                  <div>
                    <p className="font-semibold text-ink">
                      <span className="capitalize">{v.kind}</span> with {names[v.member_id] ?? "family"}
                    </p>
                    <p className="text-sm text-slate">
                      {new Date(v.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${v.status === "confirmed" ? "bg-mist text-primary-dark" : "bg-warn-bg text-warn"}`}>
                    {v.status === "confirmed" ? "Confirmed" : "Waiting"}
                  </span>
                </div>
              ))}
            </section>
          ))
        ) : (
          <div className={`${card} text-center`}>
            <p className="font-semibold text-ink">Nothing scheduled yet</p>
            <p className="mt-1 text-sm text-slate">When Sodalis hears about a good time to visit, it will show up here.</p>
          </div>
        )}
      </div>

      <button disabled className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-sand bg-white font-semibold text-slate opacity-70">
        Connect Google Calendar
        <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs font-semibold text-primary-dark">Coming soon</span>
      </button>
    </Screen>
  );
}
