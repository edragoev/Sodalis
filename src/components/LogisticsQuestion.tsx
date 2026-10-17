"use client";

import { DISTANCE, TRANSPORT, composeLogistics, parseLogistics, type Logistics } from "@/lib/logistics";
import { textareaCls } from "./ui";

// "medium" matches the other questions in the questionnaire (18px, like their text boxes);
// "compact" matches the other answers on the profile page.
type Size = "medium" | "compact";
const chip = (on: boolean, size: Size) =>
  `rounded-2xl border text-left transition-colors ${size === "medium" ? "px-4 py-3 text-lg" : "px-3.5 py-2.5 text-base"} ${
    on ? "border-primary bg-mist font-semibold text-primary-dark" : "border-sand bg-white text-ink hover:bg-cream"
  }`;

// "How do you usually get to visit?" answered with taps. The value is the stored sentence
// (see lib/logistics.ts). Anything that isn't one of our sentences, such as an older free-text
// answer, is shown in the note box so nothing is lost.
export default function LogisticsQuestion({ value, onChange, size = "medium" }: { value: string; onChange: (v: string) => void; size?: Size }) {
  const l: Logistics = parseLogistics(value) ?? { transport: "", distance: "", note: value };
  const remote = !!TRANSPORT.find((t) => t.label === l.transport)?.remote;
  const set = (patch: Partial<Logistics>) => onChange(composeLogistics({ ...l, ...patch }));
  // Tapping the chosen option again clears it.
  const toggle = (key: "transport" | "distance", label: string) => set({ [key]: l[key] === label ? "" : label });
  const legend = size === "medium" ? "mb-3 text-lg font-semibold text-ink" : "mb-2 text-sm font-medium text-slate";

  return (
    <div className={size === "medium" ? "space-y-6" : "space-y-5"}>
      <fieldset>
        <legend className={legend}>Getting there</legend>
        <div className={`grid grid-cols-1 ${size === "medium" ? "gap-3" : "gap-2"}`}>
          {TRANSPORT.map((t) => (
            <button key={t.label} type="button" aria-pressed={l.transport === t.label} className={chip(l.transport === t.label, size)} onClick={() => toggle("transport", t.label)}>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      {!remote && (
        <fieldset>
          <legend className={legend}>How far away?</legend>
          <div className={`grid grid-cols-2 ${size === "medium" ? "gap-3" : "gap-2"}`}>
            {DISTANCE.map((d) => (
              <button key={d.label} type="button" aria-pressed={l.distance === d.label} className={chip(l.distance === d.label, size)} onClick={() => toggle("distance", d.label)}>
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label className={`mb-2 block font-semibold text-ink ${size === "medium" ? "text-lg" : "text-sm"}`} htmlFor="logistics-note">
          Anything else? <span className={`font-normal text-slate ${size === "medium" ? "text-base" : "text-sm"}`}>(optional)</span>
        </label>
        <textarea
          id="logistics-note"
          className={`${textareaCls} min-h-24 ${size === "medium" ? "text-lg" : "text-base"}`}
          maxLength={500}
          placeholder="e.g. Weekends only, never before 10"
          value={l.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
    </div>
  );
}
