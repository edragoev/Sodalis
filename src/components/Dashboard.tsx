"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getSession } from "@/lib/session";
import InviteCard from "./InviteCard";
import { Avatar, Screen, TabBar } from "./ui";

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
type CallRequest = { id: string; reason: string | null; status: string; created_at: string };
type Visit = { id: string; kind: "visit" | "call"; starts_at: string; status: string };

const TABLES = ["check_ins", "alerts", "call_requests", "visits"] as const;
const RANK = { urgent: 0, warn: 1, info: 2 } as const;

const ALERT_STYLE: Record<Alert["severity"], { card: string; icon: string; label: string; text: string }> = {
  urgent: { card: "border-danger/30 bg-danger-bg", icon: "bg-danger/15 text-danger", label: "Needs attention", text: "text-danger" },
  warn: { card: "border-warn/30 bg-warn-bg", icon: "bg-warn/15 text-warn", label: "Worth a look", text: "text-warn" },
  info: { card: "border-sand bg-white", icon: "bg-mist text-primary", label: "Update", text: "text-primary" },
};

function when(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `Today, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

function Face({ score }: { score: number | null }) {
  const mouth = score == null || (score > -0.35 && score <= 0.35) ? "M9 20h10" : score > 0.35 ? "M8 18c2 3 8 3 10 0" : "M8 21c2-3 8-3 10 0";
  return (
    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-primary/20 bg-mist text-primary">
      <svg viewBox="0 0 26 26" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="9" cy="11" r=".8" fill="currentColor" />
        <circle cx="17" cy="11" r=".8" fill="currentColor" />
        <path d={mouth} transform={score != null && score > 0.35 ? "" : "translate(0 -3)"} />
      </svg>
    </span>
  );
}

function Trend({ points }: { points: { score: number; date: Date }[] }) {
  if (points.length < 2) return null;
  const W = 300, H = 84, pad = 20, top = 10, base = 56;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (s: number) => top + ((1 - s) / 2) * (base - top);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`).join(" ");
  const today = new Date().toDateString();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 w-full" role="img" aria-label="Mood over recent calls">
      <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => {
        const isToday = p.date.toDateString() === today;
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.score)} r={isToday ? 5 : 3.5} fill={isToday ? "var(--color-primary)" : "#fff"} stroke="var(--color-primary)" strokeWidth="2" />
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fontWeight={isToday ? 700 : 400} fill={isToday ? "var(--color-ink)" : "var(--color-slate)"}>
              {isToday ? "Today" : p.date.toLocaleDateString(undefined, { weekday: "short" })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState("");
  const [memberId, setMemberId] = useState("");
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
      db.from("call_requests").select("id, reason, status, created_at")
        .eq("senior_id", id).eq("status", "pending").order("created_at", { ascending: false }),
      db.from("visits").select("id, kind, starts_at, status")
        .eq("senior_id", id).in("status", ["proposed", "confirmed"]).gte("starts_at", new Date().toISOString())
        .order("starts_at").limit(10),
    ]);
    if (s.error || c.error) return setError("Couldn't load the dashboard.");
    setError("");
    setSeniorName(s.data?.name?.split(" ")[0] ?? "");
    setCheckIns((c.data ?? []) as CheckIn[]);
    setAlerts(((a.data ?? []) as Alert[]).sort((x, y) => RANK[x.severity] - RANK[y.severity]));
    setRequests((r.data ?? []) as CallRequest[]);
    setVisits((v.data ?? []) as Visit[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    queueMicrotask(() => {
      setMe(s.name ?? "");
      setMemberId(s.member_id);
    });
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
  const trend = completed
    .filter((c) => c.mood_score != null)
    .slice(0, 7)
    .reverse()
    .map((c) => ({ score: c.mood_score as number, date: new Date(c.started_at) }));
  const [topAlert, ...otherAlerts] = alerts;
  const first = me.split(" ")[0];
  const sName = seniorName || "your loved one";

  if (error) return <p role="alert" className="p-8 text-danger">{error}</p>;
  if (!loaded) return <p className="p-8 text-slate">Loading…</p>;

  const card = "rounded-3xl border border-sand bg-white p-5";

  return (
    <Screen tabs={<TabBar active="home" name={first} />}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-slate">{first ? `${greeting()}, ${first}` : greeting()}</p>
          <h1 className="font-serif text-3xl font-semibold leading-tight text-ink">Here&apos;s how {sName} is</h1>
        </div>
        <button aria-label="My profile" onClick={() => router.push("/profile")}>
          <Avatar name={me || "?"} />
        </button>
      </header>

      <div className="mt-6 space-y-4">
        {topAlert && (
          <section aria-label="Alerts" className="space-y-3">
            <div className={`rounded-3xl border p-5 ${ALERT_STYLE[topAlert.severity].card}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${ALERT_STYLE[topAlert.severity].icon}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l10 18H2L12 3ZM12 10v5M12 18v.5" />
                  </svg>
                </span>
                <div>
                  <p className={`text-xs font-semibold ${ALERT_STYLE[topAlert.severity].text}`}>
                    {ALERT_STYLE[topAlert.severity].label} · {when(topAlert.created_at)}
                  </p>
                  <p className="mt-1 text-lg font-semibold leading-snug text-ink">{topAlert.message}</p>
                </div>
              </div>
            </div>
            {otherAlerts.map((a) => (
              <div key={a.id} className={`rounded-2xl border px-4 py-3 ${ALERT_STYLE[a.severity].card}`}>
                <p className="text-ink">{a.message}</p>
                <p className="text-xs text-slate">{when(a.created_at)}</p>
              </div>
            ))}
          </section>
        )}

        <section className={card}>
          <p className="text-sm font-medium text-slate">{sName}&apos;s mood today</p>
          {latest ? (
            <>
              <div className="mt-3 flex items-center gap-4">
                <Face score={latest.mood_score} />
                <div>
                  <p className="font-serif text-3xl font-semibold capitalize text-ink">{latest.mood_label ?? "Mood unknown"}</p>
                  {latest.engagement_score != null && (
                    <p className="text-slate">Engaged {Math.round(latest.engagement_score * 100)}% on the last call</p>
                  )}
                </div>
              </div>
              <Trend points={trend} />
              <p className="mt-2 border-t border-sand pt-3 text-sm text-slate">From the call · {when(latest.started_at)}</p>
            </>
          ) : (
            <p className="mt-2 text-slate">No calls yet. Hope&apos;s first summary will show up here.</p>
          )}
        </section>

        {requests.length > 0 && (
          <section className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="rounded-3xl bg-peach p-5">
                <p className="text-xs font-semibold text-accent">{sName} would love to hear from you</p>
                <p className="mt-1 text-lg font-semibold text-ink">{r.reason ?? `${sName} asked Hope to reach out to family`}</p>
                <p className="mt-1 text-sm text-slate">{when(r.created_at)}</p>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-serif text-2xl font-semibold text-ink">Coming up</h2>
          {visits.length ? (
            visits.map((v) => (
              <div key={v.id} className={`${card} flex items-center justify-between py-4`}>
                <div>
                  <p className="font-semibold capitalize text-ink">{v.kind}</p>
                  <p className="text-sm text-slate">{when(v.starts_at)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${v.status === "confirmed" ? "bg-mist text-primary-dark" : "bg-warn-bg text-warn"}`}>
                  {v.status}
                </span>
              </div>
            ))
          ) : (
            <p className="text-slate">Nothing scheduled yet.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-2xl font-semibold text-ink">Recent calls with Hope</h2>
          {checkIns.length ? (
            checkIns.map((c) => (
              <article key={c.id} className={`${card} space-y-2`}>
                <div className="flex items-center justify-between text-sm text-slate">
                  <span>{when(c.started_at)}</span>
                  <span className="font-semibold capitalize">
                    {c.status === "completed" ? c.mood_label ?? "" : c.status.replace("_", " ")}
                  </span>
                </div>
                {c.summary && <p className="leading-relaxed text-ink">{c.summary}</p>}
                {!!c.topics?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.topics.map((t) => (
                      <span key={t} className="rounded-full bg-mist px-3 py-1 text-sm text-primary-dark">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))
          ) : (
            <p className="text-slate">Nothing yet.</p>
          )}
        </section>

        {memberId && <InviteCard memberId={memberId} seniorName={sName} />}
      </div>
    </Screen>
  );
}
