"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { clearSession, getSession } from "@/lib/session";

type CheckIn = {
  id: string;
  started_at: string;
  status: string;
  summary: string | null;
  mood_score: number | null;
  mood_label: string | null;
  topics: string[] | null;
  engagement_score: number | null;
};
type Alert = { id: string; type: string; severity: "info" | "warn" | "urgent"; message: string; created_at: string };
type CallRequest = { id: string; reason: string | null; urgency: string | null; status: string; created_at: string };
type Visit = { id: string; kind: "visit" | "call"; starts_at: string; status: string; member_id: string };

const TABLES = ["check_ins", "alerts", "call_requests", "visits"] as const;

const severityCls: Record<Alert["severity"], string> = {
  urgent: "border-red-300 bg-red-50 text-red-900",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-stone-200 bg-white text-stone-800",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function moodEmoji(score: number | null) {
  if (score == null) return "·";
  if (score > 0.35) return "😊";
  if (score > -0.35) return "😐";
  return "😔";
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 240, h = 48;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${((1 - v) / 2) * (h - 8) + 4}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" role="img" aria-label="Mood over recent calls">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-700" />
    </svg>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [seniorName, setSeniorName] = useState("");
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [requests, setRequests] = useState<CallRequest[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (id: string) => {
    const db = supabaseBrowser();
    const [s, c, a, r, v] = await Promise.all([
      db.from("seniors").select("name").eq("id", id).maybeSingle(),
      db.from("check_ins").select("id, started_at, status, summary, mood_score, mood_label, topics, engagement_score")
        .eq("senior_id", id).order("started_at", { ascending: false }).limit(14),
      db.from("alerts").select("id, type, severity, message, created_at")
        .eq("senior_id", id).is("acknowledged_by", null).order("created_at", { ascending: false }).limit(10),
      db.from("call_requests").select("id, reason, urgency, status, created_at")
        .eq("senior_id", id).eq("status", "pending").order("created_at", { ascending: false }),
      db.from("visits").select("id, kind, starts_at, status, member_id")
        .eq("senior_id", id).in("status", ["proposed", "confirmed"]).gte("starts_at", new Date().toISOString())
        .order("starts_at").limit(10),
    ]);
    if (s.error || c.error) return setError("Couldn't load the dashboard.");
    setError("");
    setSeniorName(s.data?.name?.split(" ")[0] ?? "");
    setCheckIns((c.data ?? []) as CheckIn[]);
    setAlerts((a.data ?? []) as Alert[]);
    setRequests((r.data ?? []) as CallRequest[]);
    setVisits((v.data ?? []) as Visit[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    let db: ReturnType<typeof supabaseBrowser>;
    try {
      db = supabaseBrowser();
    } catch {
      return void queueMicrotask(() => setError("Supabase isn't configured yet."));
    }
    queueMicrotask(() => load(s.senior_id));
    // Any change to these tables for this senior triggers a refetch.
    const channel = db.channel(`senior-${s.senior_id}`);
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `senior_id=eq.${s.senior_id}` }, () => load(s.senior_id));
    }
    channel.subscribe();
    return () => void db.removeChannel(channel);
  }, [router, load]);

  const completed = checkIns.filter((c) => c.status === "completed");
  const latest = completed[0];
  const moodSeries = completed.filter((c) => c.mood_score != null).map((c) => c.mood_score as number).reverse();

  if (error) return <p role="alert" className="p-8 text-red-800">{error}</p>;
  if (!loaded) return <p className="p-8 text-stone-600">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900">{seniorName ? `${seniorName}'s week` : "Dashboard"}</h1>
          <p className="text-stone-600">Updates live when Hope finishes a call.</p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link href="/profile" className="text-teal-800 underline">My profile</Link>
          <button className="text-stone-500 underline" onClick={() => { clearSession(); router.push("/"); }}>Switch</button>
        </nav>
      </header>

      {alerts.length > 0 && (
        <section aria-label="Alerts" className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className={`rounded-xl border p-4 ${severityCls[a.severity]}`}>
              <p className="font-medium">{a.message}</p>
              <p className="text-sm opacity-70">{when(a.created_at)}</p>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">How {seniorName || "they"} {seniorName ? "is" : "are"} doing</h2>
        {latest ? (
          <div className="mt-3 space-y-3">
            <p className="flex items-center gap-3 text-xl text-stone-900">
              <span className="text-3xl">{moodEmoji(latest.mood_score)}</span>
              <span className="capitalize">{latest.mood_label ?? "No mood recorded"}</span>
            </p>
            <Sparkline values={moodSeries} />
            {latest.engagement_score != null && (
              <p className="text-sm text-stone-600">Engagement {Math.round(latest.engagement_score * 100)}% on the last call</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-stone-600">No calls yet. Hope&apos;s first summary will show up here.</p>
        )}
      </section>

      {requests.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-stone-900">{seniorName || "They"} would love a call</h2>
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <p className="text-stone-900">{r.reason ?? "Asked Hope to reach out to family"}</p>
              <p className="text-sm text-stone-600">{when(r.created_at)}</p>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-900">Coming up</h2>
        {visits.length ? (
          visits.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
              <span className="capitalize text-stone-900">{v.kind}</span>
              <span className="text-stone-600">{when(v.starts_at)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${v.status === "confirmed" ? "bg-teal-100 text-teal-900" : "bg-amber-100 text-amber-900"}`}>{v.status}</span>
            </div>
          ))
        ) : (
          <p className="text-stone-600">Nothing scheduled yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-900">Recent calls with Hope</h2>
        {checkIns.length ? (
          checkIns.map((c) => (
            <article key={c.id} className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm text-stone-500">
                <span>{when(c.started_at)}</span>
                <span>{c.status === "completed" ? `${moodEmoji(c.mood_score)} ${c.mood_label ?? ""}` : c.status.replace("_", " ")}</span>
              </div>
              {c.summary && <p className="text-stone-900">{c.summary}</p>}
              {!!c.topics?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {c.topics.map((t) => (
                    <span key={t} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-sm text-stone-700">{t}</span>
                  ))}
                </div>
              )}
            </article>
          ))
        ) : (
          <p className="text-stone-600">Nothing yet.</p>
        )}
      </section>
    </div>
  );
}
