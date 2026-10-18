"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getSession } from "@/lib/session";
import { BackButton, MoodFace, Screen, headingCls, subCls } from "./ui";

type Flag = { present?: boolean; detail?: string | null; severity?: string; who?: string | null; reason?: string | null };
type Call = {
  id: string;
  senior_id: string;
  started_at: string;
  duration_s: number | null;
  status: string;
  transcript: string | null;
  summary: string | null;
  mood_score: number | null;
  mood_label: string | null;
  topics: string[] | null;
  engagement_score: number | null;
  flags: Record<string, Flag | boolean> | null;
  raw_extraction: { follow_up_topics?: string[] } | null;
};
type Alert = { id: string; severity: "info" | "warn" | "urgent"; message: string };

const SEVERITY_CLS = {
  urgent: "border-danger/30 bg-danger-bg",
  warn: "border-warn/30 bg-warn-bg",
  info: "border-sand bg-white",
} as const;

/** Turns the extraction's flags into short, plain sentences for the family. */
function flagNotes(flags: Call["flags"], name: string) {
  const notes: { text: string; urgent: boolean }[] = [];
  const f = flags ?? {};
  const obj = (k: string) => (typeof f[k] === "object" && f[k] ? (f[k] as Flag) : null);
  const health = obj("health_concern");
  if (health?.present) notes.push({ text: `Health: ${health.detail ?? "something worth checking"}`, urgent: health.severity === "urgent" });
  const safety = obj("safety_concern");
  if (safety?.present) notes.push({ text: `Safety: ${safety.detail ?? "something worth checking"}`, urgent: true });
  const wants = obj("wants_family_contact");
  if (wants?.present) {
    const who = wants.who ? ` ${wants.who}` : " family";
    notes.push({ text: `${name} would love to hear from${who}${wants.reason ? `: ${wants.reason}` : ""}`, urgent: false });
  }
  if (f.low_mood === true) notes.push({ text: "Sounded low", urgent: false });
  if (f.confusion_or_memory === true) notes.push({ text: "Some confusion or memory slips", urgent: false });
  return notes;
}

function Transcript({ text, name }: { text: string; name: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return (
    <div className="mt-4 space-y-3">
      {lines.map((line, i) => {
        const m = line.match(/^(AI|Assistant|Sodalis|Hope|User|Customer|Caller)\s*:\s*(.*)$/i);
        if (!m) return <p key={i} className="text-ink">{line}</p>;
        const hope = /^(ai|assistant|sodalis|hope)$/i.test(m[1]);
        return (
          <div key={i} className={hope ? "" : "pl-6"}>
            <p className={`text-xs font-semibold ${hope ? "text-primary" : "text-slate"}`}>{hope ? "Sodalis" : name}</p>
            <p className="leading-relaxed text-ink">{m[2]}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function CallDetail({ id }: { id: string }) {
  const router = useRouter();
  const [call, setCall] = useState<Call | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [seniorName, setSeniorName] = useState("");
  const [me, setMe] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    const db = supabaseBrowser();
    Promise.all([
      db.from("check_ins")
        .select("id, senior_id, started_at, duration_s, status, transcript, summary, mood_score, mood_label, topics, engagement_score, flags, raw_extraction")
        .eq("id", id).maybeSingle(),
      db.from("alerts").select("id, severity, message").eq("check_in_id", id).order("created_at"),
      db.from("seniors").select("name").eq("id", s.senior_id).maybeSingle(),
    ])
      .then(([c, a, n]) => {
        setMe(s.name?.split(" ")[0] ?? "");
        setSeniorName(n.data?.name?.split(" ")[0] ?? "");
        // Only calls for the elder this device is linked to.
        if (c.error || !c.data || c.data.senior_id !== s.senior_id) return setState("missing");
        setCall(c.data as Call);
        setAlerts((a.data ?? []) as Alert[]);
        setState("ready");
      })
      .catch(() => setState("missing"));
  }, [id, router]);

  const back = () => (window.history.length > 1 ? router.back() : router.push("/dashboard"));

  if (state === "loading") return <p className="p-8 text-slate">Loading…</p>;
  if (state === "missing" || !call)
    return (
      <Screen top={<BackButton onClick={back} />}>
        <h1 className={headingCls}>We couldn&apos;t find that call</h1>
        <p className={subCls}>It may have been removed, or it belongs to someone you&apos;re not linked to.</p>
      </Screen>
    );

  const name = seniorName || "They";
  const when = new Date(call.started_at);
  const mins = call.duration_s ? Math.max(1, Math.round(call.duration_s / 60)) : null;
  const notes = flagNotes(call.flags, name);
  const followUps = call.raw_extraction?.follow_up_topics ?? [];
  const answered = call.status === "completed";

  return (
    <Screen top={<BackButton onClick={back} />}>
      <p className="text-slate">
        {when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} ·{" "}
        {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        {mins ? ` · ${mins} min` : ""}
      </p>
      <h1 className={`${headingCls} mt-1`}>{answered ? `Call with ${name}` : `${name} didn't pick up`}</h1>

      {!answered && (
        <p className={subCls}>
          Sodalis {call.status === "failed" ? "couldn't connect" : "got no answer"} this time. It will try again later.
        </p>
      )}

      {alerts.length > 0 && (
        <section aria-label="Alerts from this call" className="mt-6 space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className={`rounded-2xl border p-4 ${SEVERITY_CLS[a.severity]}`}>
              <p className="font-semibold text-ink">{a.message}</p>
            </div>
          ))}
        </section>
      )}

      {answered && (
        <>
          <section className="mt-6 rounded-3xl border border-sand p-5">
            <div className="flex items-center gap-4">
              <MoodFace score={call.mood_score} />
              <div>
                <p className="text-sm font-medium text-slate">Mood on this call</p>
                <p className="font-serif text-3xl font-semibold capitalize text-ink">{call.mood_label ?? "Not recorded"}</p>
              </div>
            </div>
            {call.engagement_score != null && (
              <div className="mt-5">
                <div className="flex justify-between text-sm text-slate">
                  <span>Engagement</span>
                  <span>{Math.round(call.engagement_score * 100)}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-sand/60">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(call.engagement_score * 100)}%` }} />
                </div>
              </div>
            )}
          </section>

          {call.summary && (
            <section className="mt-6">
              <h2 className="font-serif text-2xl font-semibold text-ink">What they talked about</h2>
              <p className="mt-2 text-lg leading-relaxed text-ink">{call.summary}</p>
            </section>
          )}

          {!!call.topics?.length && (
            <div className="mt-4 flex flex-wrap gap-2">
              {call.topics.map((t) => (
                <span key={t} className="rounded-full bg-mist px-3 py-1 text-primary-dark">{t}</span>
              ))}
            </div>
          )}

          {notes.length > 0 && (
            <section className="mt-6">
              <h2 className="font-serif text-2xl font-semibold text-ink">Worth knowing</h2>
              <ul className="mt-3 space-y-2">
                {notes.map((n, i) => (
                  <li key={i} className={`rounded-2xl px-4 py-3 ${n.urgent ? "bg-danger-bg text-ink" : "bg-warn-bg text-ink"}`}>
                    {n.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {followUps.length > 0 && (
            <section className="mt-6">
              <h2 className="font-serif text-2xl font-semibold text-ink">Sodalis will follow up on</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-lg text-ink">
                {followUps.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          {call.transcript && (
            <details className="mt-8 rounded-3xl border border-sand p-5">
              <summary className="cursor-pointer font-semibold text-ink">Read the full conversation</summary>
              <Transcript text={call.transcript} name={name} />
            </details>
          )}
        </>
      )}
      {me && <p className="mt-8 text-sm text-slate">Shared with the whole family circle.</p>}
    </Screen>
  );
}
