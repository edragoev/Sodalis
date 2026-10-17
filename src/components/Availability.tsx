"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BLOCKS, DAYS, DAY_NAMES, cellKey, fromWindows, toWindows } from "@/lib/availability";
import { getSession } from "@/lib/session";
import { Button, Screen, TabBar, headingCls, subCls } from "./ui";

const PRESETS = [
  { label: "Weekday evenings", cells: [1, 2, 3, 4, 5].map((d) => cellKey(d, 2)) },
  { label: "Weekends", cells: [0, 6].flatMap((d) => [0, 1, 2].map((b) => cellKey(d, b))) },
];

export default function Availability() {
  const router = useRouter();
  const [memberId, setMemberId] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

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

  function toggle(key: string) {
    const next = new Set(selected);
    if (!next.delete(key)) next.add(key);
    setSelected(next);
    setDirty(true);
    setNote("");
  }

  function applyPreset(cells: string[]) {
    const all = cells.every((c) => selected.has(c));
    const next = new Set(selected);
    cells.forEach((c) => (all ? next.delete(c) : next.add(c)));
    setSelected(next);
    setDirty(true);
    setNote("");
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
      setNote("Saved. We'll suggest visits and calls that fit.");
    } catch {
      setNote("Couldn't save. Please try again.");
    }
    setBusy(false);
  }

  if (!loaded) return <p className="p-8 text-slate">Loading…</p>;

  return (
    <Screen
      tabs={<TabBar active="availability" name={name} />}
      footer={
        <div className="space-y-2">
          <Button className="w-full" disabled={busy || !dirty} onClick={save}>
            {busy ? "Saving…" : "Save my times"}
          </Button>
          {note && (
            <p role="status" className={`text-center text-sm ${note.startsWith("Saved") ? "text-primary-dark" : "text-danger"}`}>
              {note}
            </p>
          )}
        </div>
      }
    >
      <h1 className={headingCls}>When are you free?</h1>
      <p className={subCls}>Tap the times that usually work for a visit or a call. You can change this any time.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.cells)}
            className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink hover:bg-mist"
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => {
            setSelected(new Set());
            setDirty(true);
            setNote("");
          }}
          className="rounded-full px-4 py-2 text-sm font-semibold text-slate underline-offset-4 hover:underline"
        >
          Clear all
        </button>
      </div>

      <div className="mt-6 grid grid-cols-[3rem_repeat(3,1fr)] items-center gap-2" role="group" aria-label="Weekly availability">
        <span />
        {BLOCKS.map((b) => (
          <div key={b.label} className="text-center">
            <p className="text-xs font-semibold text-ink">{b.label}</p>
            <p className="text-xs text-slate">{b.hint}</p>
          </div>
        ))}
        {DAYS.map((day, d) => (
          <div key={day} className="contents">
            <span className="text-sm font-semibold text-ink">{day}</span>
            {BLOCKS.map((b, i) => {
              const on = selected.has(cellKey(d, i));
              return (
                <button
                  key={b.label}
                  aria-pressed={on}
                  aria-label={`${DAY_NAMES[d]} ${b.label.toLowerCase()}`}
                  onClick={() => toggle(cellKey(d, i))}
                  className={`h-12 rounded-xl border text-lg transition-colors ${
                    on ? "border-primary bg-primary text-white" : "border-sand bg-white text-transparent hover:bg-mist"
                  }`}
                >
                  ✓
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Screen>
  );
}
