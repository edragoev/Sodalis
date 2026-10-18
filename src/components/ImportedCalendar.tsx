"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Occurrence } from "@/lib/calendar/expand";
import { wallClock } from "@/lib/calendar/tz";
import { Button } from "./ui";

const MAX_BYTES = 10 * 1024 * 1024;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const batchKey = (memberId: string) => `sodalis.calendar-batch.${memberId}`;

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function readBatch(memberId: string) {
  try {
    return localStorage.getItem(batchKey(memberId)) ?? "";
  } catch {
    return "";
  }
}
function writeBatch(memberId: string, id: string) {
  try {
    if (id) localStorage.setItem(batchKey(memberId), id);
    else localStorage.removeItem(batchKey(memberId));
  } catch {}
}

async function loadEvents(memberId: string, from: Date, to: Date): Promise<Occurrence[]> {
  const q = new URLSearchParams({ member_id: memberId, from: from.toISOString(), to: to.toISOString() });
  const res = await fetch(`/api/calendar/events?${q}`);
  if (!res.ok) throw new Error();
  return ((await res.json()).events ?? []) as Occurrence[];
}

/**
 * Upload a Google Calendar export (.ics or .zip) and see it as a month calendar.
 * onUpcoming gets the next 7 days of events so the weekly grid can hint at busy times.
 */
export default function ImportedCalendar({ memberId, onUpcoming }: { memberId: string; onUpcoming: (events: Occurrence[]) => void }) {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const [today] = useState(() => wallClock(Date.now(), tz));
  const [month, setMonth] = useState({ year: today.year, month: today.month });
  const [events, setEvents] = useState<Occurrence[]>([]);
  const [selected, setSelected] = useState(dayKey(today.year, today.month, today.day));
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState(() => readBatch(memberId));
  const [reload, setReload] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Loads the visible month, and the next 7 days for the weekly grid hints. `reload` re-runs it after an upload.
  useEffect(() => {
    let live = true;
    const from = new Date(Date.UTC(month.year, month.month - 1, 1) - 86_400_000);
    const to = new Date(Date.UTC(month.year, month.month, 1) + 86_400_000);
    const now = new Date();
    Promise.all([loadEvents(memberId, from, to), loadEvents(memberId, now, new Date(+now + 7 * 86_400_000))])
      .then(([shown, soon]) => {
        if (!live) return;
        setEvents(shown);
        onUpcoming(soon);
      })
      .catch(() => live && setProblem("Couldn't load your calendar."));
    return () => {
      live = false;
    };
  }, [memberId, month, reload, onUpcoming]);

  async function upload(file: File) {
    setProblem("");
    setStatus("");
    if (!/\.(ics|zip)$/i.test(file.name)) return setProblem("Choose a .ics or .zip file.");
    if (file.size > MAX_BYTES) return setProblem("That file is too large (10 MB max).");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("member_id", memberId);
      const res = await fetch("/api/calendar/import", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't import that file.");
      writeBatch(memberId, body.batch_id);
      setBatchId(body.batch_id);
      setStatus(`${body.imported} imported, ${body.updated} updated, ${body.skipped} skipped`);
      setReload((n) => n + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't import that file.");
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setProblem("");
    const res = await fetch(`/api/calendar/import/${batchId}?member_id=${memberId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      writeBatch(memberId, "");
      setBatchId("");
      setStatus("Imported calendar removed.");
      setReload((n) => n + 1);
    } else setProblem("Couldn't remove it. Please try again.");
    setBusy(false);
  }

  // Events by local day (a multi-day event is listed on the day it starts).
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const ev of events) {
      const w = wallClock(Date.parse(ev.starts_at), tz);
      const k = dayKey(w.year, w.month, w.day);
      map.set(k, [...(map.get(k) ?? []), ev]);
    }
    return map;
  }, [events, tz]);

  const first = new Date(Date.UTC(month.year, month.month - 1, 1));
  const lead = first.getUTCDay();
  const days = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const title = first.toLocaleDateString([], { month: "long", year: "numeric", timeZone: "UTC" });
  const step = (n: number) => {
    const d = new Date(Date.UTC(month.year, month.month - 1 + n, 1));
    setMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  };
  const todayKey = dayKey(today.year, today.month, today.day);
  const time = (ev: Occurrence) =>
    ev.all_day ? "All day" : new Date(ev.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <section className="mt-8" aria-label="Your calendar">
      <h2 className="font-serif text-2xl font-semibold text-ink">Your calendar</h2>
      <p className="mt-1 text-slate">
        Upload your exported Google Calendar (.ics or .zip) and we&apos;ll show what you already have on.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".zip,.ics,text/calendar,application/zip"
        className="sr-only"
        aria-label="Upload calendar file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Working…" : "Upload calendar"}
        </Button>
        {batchId && (
          <button disabled={busy} onClick={remove} className="text-sm font-semibold text-slate underline-offset-4 hover:underline">
            Remove imported calendar
          </button>
        )}
      </div>
      {status && <p role="status" className="mt-2 text-sm text-slate">{status}</p>}
      {problem && <p role="alert" className="mt-2 text-sm text-danger">{problem}</p>}

      <div className="mt-4 rounded-2xl border border-sand bg-white p-3">
        <div className="flex items-center justify-between">
          <button aria-label="Previous month" onClick={() => step(-1)} className="h-10 w-10 rounded-lg text-xl text-ink hover:bg-mist">‹</button>
          <span className="font-semibold text-ink">{title}</span>
          <button aria-label="Next month" onClick={() => step(1)} className="h-10 w-10 rounded-lg text-xl text-ink hover:bg-mist">›</button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center" role="grid" aria-label={title}>
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="py-1 text-xs font-semibold text-slate">{w}</span>
          ))}
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const k = dayKey(month.year, month.month, i + 1);
            const count = byDay.get(k)?.length ?? 0;
            const on = k === selected;
            return (
              <button
                key={k}
                onClick={() => setSelected(k)}
                aria-current={on ? "date" : undefined}
                aria-label={`${title.split(" ")[0]} ${i + 1}${count ? `, ${count} event${count > 1 ? "s" : ""}` : ""}`}
                className={`flex h-11 flex-col items-center justify-center rounded-lg text-sm ${
                  on ? "bg-primary text-white" : k === todayKey ? "bg-mist font-bold text-primary-dark" : "text-ink hover:bg-mist"
                }`}
              >
                {i + 1}
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${count ? (on ? "bg-white" : "bg-primary") : "bg-transparent"}`} />
              </button>
            );
          })}
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {(byDay.get(selected) ?? []).map((ev) => (
          <li key={ev.id} className="rounded-xl border border-sand bg-white px-4 py-3">
            <p className="font-semibold text-ink">{ev.title}</p>
            <p className="text-sm text-slate">{time(ev)}</p>
          </li>
        ))}
        {!byDay.get(selected)?.length && <li className="text-sm text-slate">Nothing on this day.</li>}
      </ul>
    </section>
  );
}
