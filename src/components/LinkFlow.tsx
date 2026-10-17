"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSession } from "@/lib/session";
import { Avatar, BackButton, Button, Logo, Screen, headingCls, inputCls, labelCls, subCls } from "./ui";

type Step = "form" | "confirm" | "newElder" | "isThisYou";

const RELATIONSHIPS = ["Daughter", "Son", "Granddaughter", "Grandson", "Niece or nephew", "Friend or neighbor", "Other"];
const PRONOUNS = ["She/her", "He/him", "They/them", "Other"];

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function SelectField({
  id, value, onChange, options, placeholder,
}: { id: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <div className="relative">
      <select
        id={id}
        className={`${inputCls} appearance-none pr-12 ${value ? "" : "text-slate/60"}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

/** "(415) •••-0142" from whatever the user typed. */
function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) •••-${d.slice(6)}` : "";
}

export default function LinkFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [otherRel, setOtherRel] = useState("");
  const [phone, setPhone] = useState("");
  const [seniorName, setSeniorName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [otherPronouns, setOtherPronouns] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const relValue = relationship === "Other" ? otherRel.trim() : relationship;
  const pronounValue = pronouns === "Other" ? otherPronouns.trim() : pronouns;
  const elderPhone = phone.trim().startsWith("+") ? phone : phone ? `+1 ${phone}` : "";
  const formReady = name.trim() && relValue && phone.replace(/\D/g, "").length >= 10;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  // Joins the elder's circle and moves on (shared by the "found" and "new elder" paths).
  async function join(reconnect = false) {
    const { status, data } = await post("/api/link/join", { phone: elderPhone, name, relationship: relValue, reconnect });
    if (status === 409 && data.exists) return setStep("isThisYou");
    if (status !== 200) return setError(data.error ?? "Could not join");
    saveSession({ member_id: data.member_id, senior_id: data.senior_id, name: name.trim() });
    router.push(data.reconnected ? "/dashboard" : "/questionnaire");
  }

  const lookup = () =>
    run(async () => {
      const { status, data } = await post("/api/link/lookup", { phone: elderPhone });
      if (status !== 200) return setError(data.error ?? "Lookup failed");
      if (data.found) {
        setSeniorName(data.senior_first_name);
        setStep("confirm");
      } else {
        setSeniorName("");
        setStep("newElder");
      }
    });

  const createElderAndJoin = () =>
    run(async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
      const { status, data } = await post("/api/link/elders", {
        name: seniorName,
        phone: elderPhone,
        timezone,
        pronouns: pronounValue || undefined,
      });
      if (status !== 200) return setError(data.error ?? "Could not create elder");
      setSeniorName(data.senior_first_name);
      await join();
    });

  const errorBox = error && (
    <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-danger">
      {error}
    </p>
  );

  if (step === "confirm")
    return (
      <Screen
        top={<BackButton onClick={() => setStep("form")} />}
        footer={
          <div className="space-y-1">
            <Button className="w-full" disabled={busy} onClick={() => run(() => join())}>
              Yes, that&apos;s them
            </Button>
            <Button variant="text" onClick={() => setStep("form")}>
              Use a different number
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center pt-6 text-center">
          <Avatar name={seniorName} size={112} />
          <p className="mt-8 text-lg text-slate">Linking to</p>
          <h1 className="font-serif text-5xl font-semibold text-ink">{seniorName}</h1>
          {maskPhone(phone) && <p className="mt-3 text-lg text-slate">{maskPhone(phone)}</p>}
          <p className="mt-10 max-w-xs text-lg leading-relaxed text-ink">
            Hope calls {seniorName} to check in. Is this the right person?
          </p>
          {errorBox}
        </div>
      </Screen>
    );

  if (step === "newElder")
    return (
      <Screen
        top={<BackButton onClick={() => setStep("form")} />}
        footer={
          <Button
            className="w-full"
            disabled={busy || !seniorName.trim() || !pronouns || (pronouns === "Other" && !otherPronouns.trim())}
            onClick={createElderAndJoin}
          >
            Finish setup
          </Button>
        }
      >
        <h1 className={headingCls}>Who will Hope be calling?</h1>
        <p className={subCls}>We don&apos;t have {elderPhone} yet. Tell us a little about them.</p>
        <div className="mt-8 space-y-5">
          <div>
            <label className={labelCls} htmlFor="elder-name">Their first name</label>
            <input id="elder-name" className={inputCls} value={seniorName} onChange={(e) => setSeniorName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="elder-pronouns">Their pronouns</label>
            <SelectField id="elder-pronouns" value={pronouns} onChange={setPronouns} options={PRONOUNS} placeholder="Choose one" />
            {pronouns === "Other" && (
              <input className={`${inputCls} mt-3`} placeholder="Their pronouns, in your words" value={otherPronouns} onChange={(e) => setOtherPronouns(e.target.value)} />
            )}
          </div>
        </div>
        {errorBox}
      </Screen>
    );

  if (step === "isThisYou")
    return (
      <Screen
        top={<BackButton onClick={() => setStep("form")} />}
        footer={
          <div className="space-y-1">
            <Button className="w-full" disabled={busy} onClick={() => run(() => join(true))}>
              Yes, that&apos;s me
            </Button>
            <Button variant="text" onClick={() => setStep("form")}>
              No, use a different name
            </Button>
          </div>
        }
      >
        <h1 className={headingCls}>Is this you?</h1>
        <p className={subCls}>
          <b className="text-ink">{name}</b> is already part of {seniorName ? `${seniorName}'s` : "this"} circle.
        </p>
        {errorBox}
      </Screen>
    );

  // step === "form": everything required, on one screen
  return (
    <Screen
      footer={
        <div className="space-y-3">
          <Button className="w-full" disabled={busy || !formReady} onClick={lookup}>
            Continue
          </Button>
          <p className="text-center text-sm text-slate">Your family&apos;s details stay private and are never sold.</p>
        </div>
      }
    >
      <div className="pt-4">
        <Logo />
      </div>
      <h1 className={`${headingCls} mt-12`}>Stay close to someone you love</h1>
      <p className={subCls}>A few quick details and you&apos;re in.</p>
      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (formReady && !busy) lookup();
        }}
      >
        <div>
          <label className={labelCls} htmlFor="your-name">Your first name</label>
          <input id="your-name" className={inputCls} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="relationship">How are you related to them?</label>
          <SelectField id="relationship" value={relationship} onChange={setRelationship} options={RELATIONSHIPS} placeholder="Choose one" />
          {relationship === "Other" && (
            <input className={`${inputCls} mt-3`} placeholder="Tell us how you're connected" value={otherRel} onChange={(e) => setOtherRel(e.target.value)} />
          )}
        </div>
        <div>
          <label className={labelCls} htmlFor="elder-phone">Their phone number</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate">+1</span>
            <input id="elder-phone" className={`${inputCls} pl-12`} inputMode="tel" autoComplete="off" placeholder="(415) 555-0142"
              value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <p className="mt-2 text-sm text-slate">The number Hope calls to check in on them.</p>
        </div>
        <button type="submit" className="hidden" />
      </form>
      {errorBox}
    </Screen>
  );
}
