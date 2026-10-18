"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DAY_LETTERS, DAY_NAMES, SLOTS, cellKey, dayKeys, fromWindows, slotKeys, toWindows } from "@/lib/availability";
import { busyCells } from "@/lib/calendar/busy";
import type { Occurrence } from "@/lib/calendar/expand";
import { getSession } from "@/lib/session";
import ImportedCalendar from "./ImportedCalendar";
import { Button, Screen, TabBar, headingCls, subCls } from "./ui";

// "After work" on weekdays (4 to 8 pm), and the daytime on weekends (8 am to 8 pm).
const PRESETS = [
  { label: "Weekday evenings", cells: [1, 2, 3, 4, 5].flatMap((d) => [4, 5].map((s) => cellKey(d, s))) },
  { label: "Weekends", cells: [0, 6].flatMap((d) => [0, 1, 2, 3, 4, 5].map((s) => cellKey(d, s))) },
];

const header = "rounded-lg py-1.5 text-sm font-semibold text-ink hover:bg-mist";

export default function Availability() {
  const router = useRouter();
  const [memberId, setMemberId] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [upcoming, setUpcoming] = useState<Occurrence[]>([]);
  // Times that clash with the imported calendar in the next 7 days. A hint only: never unticks a cell.
  const busyKeys = useMemo(() => busyCells(upcoming, Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), [upcoming]);

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    fetch(`/api/members/${s.member_id}/availability`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        setMemberId(s.member_id);
        setName(s.name?.split(" ")[0] ?? "");
        if (d) setSelected(fromWindows(d.windows));
        else setNote("Couldn't load your saved times.");
        setLoaded(true);
      });
  }, [router]);

  // The Calendar tab's "Upload" links to #your-calendar; the browser's own jump runs while this
  // page still says "Loading…", so scroll there once the section exists.
  useEffect(() => {
    if (loaded && window.location.hash === "#your-calendar") {
      document.getElementById("your-calendar")?.scrollIntoView({ block: "start" });
    }
  }, [loaded]);

  const change = (next: Set<string>) => {
    setSelected(next);
    setDirty(true);
    setSaved(false);
    setNote("");
  };

  function toggle(key: string) {
    const next = new Set(selected);
    if (!next.delete(key)) next.add(key);
    change(next);
  }

  // A preset, a whole day or a whole time of day: select it all, or clear it if it's all selected already.
  function toggleMany(cells: string[]) {
    const all = cells.every((c) => selected.has(c));
    const next = new Set(selected);
    cells.forEach((c) => (all ? next.delete(c) : next.add(c)));
    change(next);
  }

  async function save() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/members/${memberId}/availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windows: toWindows(selected) }),
      });
      if (!res.ok) throw new Error();
      setDirty(false);
      setSaved(true);
    } catch {
      setNote("Couldn't save. Please try again.");
    }
    setBusy(false);
  }

  if (!loaded) return <p className="p-8 text-slate">Loading…</p>;

  return (
    <Screen
      top={
        <Link href="/schedule" className="text-sm font-semibold text-primary hover:underline">
          ← Calendar
        </Link>
      }
      tabs={<TabBar active="calendar" name={name} />}
      footer={
        <div className="space-y-2">
          {saved && !dirty ? (
            <div role="status" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-mist text-lg font-semibold text-primary-dark">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-good" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              Saved
            </div>
          ) : (
            <Button className="w-full" disabled={busy || !dirty} onClick={save}>
              {busy ? "Saving…" : "Save my times"}
            </Button>
          )}
          {saved && !dirty && <p className="text-center text-sm text-slate">We&apos;ll suggest visits and calls that fit.</p>}
          {note && (
            <p role="alert" className="text-center text-sm text-danger">
              {note}
            </p>
          )}
        </div>
      }
    >
      <h1 className={headingCls}>When are you free?</h1>
      <p className={subCls}>Tap the times that usually work for a visit or a call. Each square is a 2-hour window.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => toggleMany(p.cells)}
            className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink hover:bg-mist"
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => change(new Set())}
          className="rounded-full px-4 py-2 text-sm font-semibold text-slate underline-offset-4 hover:underline"
        >
          Clear all
        </button>
      </div>

      <div className="mt-6 grid grid-cols-[3.25rem_repeat(7,1fr)] items-center gap-1.5" role="group" aria-label="Weekly availability">
        <span />
        {DAY_LETTERS.map((letter, d) => (
          <button key={letter} aria-label={`Every time on ${DAY_NAMES[d]}`} onClick={() => toggleMany(dayKeys(d))} className={header}>
            {letter}
          </button>
        ))}
        {SLOTS.map((slot, i) => (
          <div key={slot.label} className="contents">
            <button aria-label={`${slot.range}, every day`} onClick={() => toggleMany(slotKeys(i))} className={`${header} text-left text-xs`}>
              {slot.label}
            </button>
            {DAY_LETTERS.map((_, d) => {
              const on = selected.has(cellKey(d, i));
              return (
                <button
                  key={d}
                  aria-pressed={on}
                  aria-label={`${DAY_NAMES[d]} ${slot.range}${busyKeys.has(cellKey(d, i)) ? ", busy on your calendar" : ""}`}
                  onClick={() => toggle(cellKey(d, i))}
                  className={`relative h-11 rounded-lg border transition-colors ${
                    on ? "border-primary bg-primary" : "border-sand bg-white hover:bg-mist"
                  }`}
                >
                  {busyKeys.has(cellKey(d, i)) && (
                    <span aria-hidden className={`absolute right-1 top-1 h-2 w-2 rounded-full ${on ? "bg-white" : "bg-warn"}`} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate">Each row starts at the time on the left. Tap a day or a time to fill its whole row or column.</p>

      <p className="mt-2 text-sm text-slate">A dot means something on your imported calendar overlaps that time in the next 7 days.</p>

      <ImportedCalendar memberId={memberId} onUpcoming={setUpcoming} />
    </Screen>
  );
}
