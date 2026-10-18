"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getSession } from "@/lib/session";
import { timeRange } from "@/lib/time-range";
import { Screen, TabBar, headingCls, subCls } from "./ui";

type Visit = { id: string; kind: "visit" | "call"; starts_at: string; ends_at: string | null; status: string; member_id: string };

const dayHeading = (d: Date, today: Date) => {
  const tomorrow = new Date(today.getTime() + 864e5);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

// The Calendar tab, top to bottom: visits and calls coming up, then the member's uploaded calendar
// (edited on the Availability page). Suggested times are 9am-8pm when that calendar is free.
export default function Schedule() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [seniorName, setSeniorName] = useState("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [now, setNow] = useState<Date | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    queueMicrotask(() => setName(s.name?.split(" ")[0] ?? ""));
    let db: ReturnType<typeof supabaseBrowser>;
    try {
      db = supabaseBrowser();
    } catch {
      return void queueMicrotask(() => setError("Couldn't load the calendar."));
    }
    Promise.all([
      db.from("seniors").select("name").eq("id", s.senior_id).maybeSingle(),
      db.from("visits").select("id, kind, starts_at, ends_at, status, member_id")
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
  const pill = "inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold";

  return (
    <Screen tabs={<TabBar active="calendar" name={name} />}>
      <h1 className={headingCls}>Calendar</h1>
      <p className={subCls}>Visits and calls with {sName}.</p>

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
                      {timeRange(v.starts_at, v.ends_at)}
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

      <h2 className="mt-10 font-serif text-xl font-semibold text-ink">When you&apos;re free</h2>
      <div className="mt-3 space-y-3">
        <section className={`${card} flex items-center justify-between gap-4`}>
          <div>
            <p className="font-semibold text-ink">Your Google Calendar</p>
            <p className="text-sm text-slate">We suggest times between 9am and 8pm when it&apos;s free.</p>
          </div>
          <Link href="/availability" className={`${pill} bg-btn text-primary-dark hover:bg-btn-hover`}>
            Upload
          </Link>
        </section>
      </div>
    </Screen>
  );
}
