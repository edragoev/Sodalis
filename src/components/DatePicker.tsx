"use client";

import { useEffect, useRef, useState } from "react";
import { Button, largeInputCls } from "./ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MIN_YEAR = 1900;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const pretty = (y: number, m: number, d: number) => `${MONTH_NAMES[m]} ${d}, ${y}`;

function parse(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
}

const arrow = "grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-mist disabled:opacity-30 disabled:hover:bg-transparent";

// A calendar in a bottom tray. Past dates only (a birthday). Tap "March 1948" to jump by month or
// year. startYear is where the calendar opens when nothing is chosen yet.
export default function DatePicker({
  id, value, onChange, placeholder = "Select a date", startYear,
}: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; startYear?: number;
}) {
  const [open, setOpen] = useState(false);
  const [today] = useState(() => new Date());
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [mode, setMode] = useState<"days" | "jump">("days");
  const [draft, setDraft] = useState(value);
  const yearRef = useRef<HTMLButtonElement | null>(null);

  const ty = today.getFullYear();
  const tm = today.getMonth();
  const td = today.getDate();
  const chosen = parse(value);

  function openPicker() {
    const v = parse(value);
    setView(v ? { y: v.y, m: v.m } : { y: startYear ?? ty, m: tm });
    setDraft(value);
    setMode("days");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // When the jump panel opens, bring the selected year into view.
  useEffect(() => {
    if (mode === "jump") yearRef.current?.scrollIntoView?.({ block: "center" });
  }, [mode]);

  const atLatest = view.y === ty && view.m === tm;
  const atEarliest = view.y === MIN_YEAR && view.m === 0;
  const step = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const draftParts = parse(draft);
  const years = Array.from({ length: ty - MIN_YEAR + 1 }, (_, i) => ty - i);

  return (
    <>
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        onClick={openPicker}
        className={`${largeInputCls} flex items-center justify-between text-left`}
      >
        <span className={chosen ? "text-ink" : "text-slate/50"}>
          {chosen ? pretty(chosen.y, chosen.m, chosen.d) : placeholder}
        </span>
        <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose a date"
            className="sheet-up w-full max-w-md rounded-t-[28px] bg-white px-5 pb-6 pt-3 shadow-[0_-8px_40px_rgba(31,42,41,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-sand" aria-hidden />

            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                className={arrow}
                disabled={mode === "jump" || atEarliest}
                onClick={() => step(-1)}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
              </button>
              <button
                type="button"
                aria-expanded={mode === "jump"}
                onClick={() => setMode(mode === "days" ? "jump" : "days")}
                className="flex items-center gap-2 rounded-full px-4 py-2 font-serif text-xl font-semibold text-ink hover:bg-mist"
              >
                {MONTH_NAMES[view.m]} {view.y}
                <span aria-hidden className={`text-base text-primary transition-transform ${mode === "jump" ? "rotate-180" : ""}`}>▾</span>
              </button>
              <button
                type="button"
                aria-label="Next month"
                className={arrow}
                disabled={mode === "jump" || atLatest}
                onClick={() => step(1)}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>

            {mode === "days" ? (
              <div className="mt-3" role="grid" aria-label={`${MONTH_NAMES[view.m]} ${view.y}`}>
                <div className="grid grid-cols-7 text-center text-sm font-semibold text-slate">
                  {WEEKDAYS.map((d) => (
                    <span key={d} className="py-2">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1">
                  {Array.from({ length: firstWeekday }, (_, i) => (
                    <span key={`b${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const d = i + 1;
                    const future = view.y === ty && view.m === tm && d > td;
                    const selected = !!draftParts && draftParts.y === view.y && draftParts.m === view.m && draftParts.d === d;
                    const isToday = view.y === ty && view.m === tm && d === td;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={future}
                        aria-label={pretty(view.y, view.m, d)}
                        aria-pressed={selected}
                        onClick={() => setDraft(iso(view.y, view.m, d))}
                        className={`mx-auto grid h-11 w-11 place-items-center rounded-full text-lg transition-colors ${
                          selected
                            ? "bg-primary font-semibold text-white"
                            : future
                              ? "text-slate/30"
                              : `text-ink hover:bg-mist ${isToday ? "ring-2 ring-btn" : ""}`
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <p className="mb-2 text-sm font-semibold text-slate">Month</p>
                <div className="grid grid-cols-4 gap-2">
                  {MONTHS.map((name, m) => {
                    const disabled = view.y === ty && m > tm;
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={disabled}
                        aria-pressed={view.m === m}
                        onClick={() => setView({ ...view, m })}
                        className={`h-11 rounded-xl text-lg ${view.m === m ? "bg-primary font-semibold text-white" : "text-ink hover:bg-mist"} disabled:text-slate/30 disabled:hover:bg-transparent`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                <p className="mb-2 mt-4 text-sm font-semibold text-slate">Year</p>
                <div className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto pr-1">
                  {years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      ref={view.y === y ? yearRef : undefined}
                      aria-pressed={view.y === y}
                      onClick={() => setView({ y, m: y === ty ? Math.min(view.m, tm) : view.m })}
                      className={`h-11 rounded-xl text-lg ${view.y === y ? "bg-primary font-semibold text-white" : "text-ink hover:bg-mist"}`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
                <Button className="mt-4 h-12 w-full text-base" variant="secondary" onClick={() => setMode("days")}>
                  Show days
                </Button>
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                className="h-14 rounded-2xl px-4 text-lg font-semibold text-slate hover:underline"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
              <Button
                className="flex-1"
                disabled={!draftParts}
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                {draftParts ? `Select ${pretty(draftParts.y, draftParts.m, draftParts.d)}` : "Pick a day"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
