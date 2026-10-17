"use client";

import { useState } from "react";
import { largeLabelCls } from "./ui";

// Chips you can add (Enter, comma or the Add button) and remove, with tap-to-add suggestions.
export default function TagInput({
  id, label, hint, values, onChange, suggestions = [], placeholder = "Type and press Enter",
}: {
  id: string; label: string; hint?: string; values: string[]; onChange: (v: string[]) => void;
  suggestions?: string[]; placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const v = raw.trim().toLowerCase().slice(0, 40);
    if (v && !values.includes(v) && values.length < 20) onChange([...values, v]);
    setDraft("");
  }
  const remaining = suggestions.filter((s) => !values.includes(s));

  return (
    <div>
      <label className={largeLabelCls} htmlFor={id}>{label}</label>
      {hint && <p className="-mt-1 mb-2 text-lg text-slate">{hint}</p>}
      <div className="flex gap-2">
        <input
          id={id}
          className="h-14 w-full rounded-2xl border border-sand bg-white px-4 text-xl text-ink outline-none placeholder:text-slate/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => (e.target.value.includes(",") ? e.target.value.split(",").forEach(add) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim()}
          className="h-14 rounded-2xl border border-sand px-5 text-lg font-semibold text-ink hover:bg-mist disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div role="group" className="mt-3 flex flex-wrap gap-2" aria-label={`${label} added`}>
          {values.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-mist py-1.5 pl-4 pr-2 text-lg text-primary-dark">
              {t}
              <button
                type="button"
                aria-label={`Remove ${t}`}
                className="grid h-7 w-7 place-items-center rounded-full hover:bg-primary/10"
                onClick={() => onChange(values.filter((x) => x !== t))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {remaining.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {remaining.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-sand px-4 py-1.5 text-lg text-slate hover:bg-mist">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
