"use client";

import { DISTANCE, TRANSPORT, composeLogistics, parseLogistics, type Logistics } from "@/lib/logistics";
import { textareaCls } from "./ui";

const chip = (on: boolean) =>
  `rounded-2xl border px-4 py-3 text-left text-xl transition-colors ${
    on ? "border-primary bg-mist font-semibold text-primary-dark" : "border-sand bg-white text-ink hover:bg-cream"
  }`;

// "How do you usually get to visit?" answered with taps. The value is the stored sentence
// (see lib/logistics.ts). Anything that isn't one of our sentences, such as an older free-text
// answer, is shown in the note box so nothing is lost.
export default function LogisticsQuestion({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const l: Logistics = parseLogistics(value) ?? { transport: "", distance: "", note: value };
  const remote = !!TRANSPORT.find((t) => t.label === l.transport)?.remote;
  const set = (patch: Partial<Logistics>) => onChange(composeLogistics({ ...l, ...patch }));
  // Tapping the chosen option again clears it.
  const toggle = (key: "transport" | "distance", label: string) => set({ [key]: l[key] === label ? "" : label });

  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="mb-3 text-2xl font-semibold text-ink">Getting there</legend>
        <div className="grid grid-cols-1 gap-3">
          {TRANSPORT.map((t) => (
            <button key={t.label} type="button" aria-pressed={l.transport === t.label} className={chip(l.transport === t.label)} onClick={() => toggle("transport", t.label)}>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      {!remote && (
        <fieldset>
          <legend className="mb-3 text-2xl font-semibold text-ink">How far away?</legend>
          <div className="grid grid-cols-2 gap-3">
            {DISTANCE.map((d) => (
              <button key={d.label} type="button" aria-pressed={l.distance === d.label} className={chip(l.distance === d.label)} onClick={() => toggle("distance", d.label)}>
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label className="mb-2 block text-2xl font-semibold text-ink" htmlFor="logistics-note">Anything else? <span className="text-lg font-normal text-slate">(optional)</span></label>
        <textarea
          id="logistics-note"
          className={`${textareaCls} min-h-24 text-xl`}
          maxLength={500}
          placeholder="e.g. Weekends only, never before 10"
          value={l.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
    </div>
  );
}
