"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OTHER, pronounOptions, pronounValue } from "@/lib/pronouns";
import { RELATIONSHIPS } from "@/lib/relationships";
import { saveSession } from "@/lib/session";
import { Avatar, BackButton, Button, Logo, Screen, SelectField, headingCls, inputCls, labelCls, subCls } from "./ui";

// Part 1: the loved one (phone, and name + pronouns if we don't know them yet).
// Part 2: you (name, pronouns, relationship). The loved one is only created at the very end.
type Step = "elderPhone" | "confirm" | "newElder" | "you" | "isThisYou";

const ELDER_SKIP = "Not sure";
const MEMBER_SKIP = "Prefer not to say";

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/** "(415) •••-0142" from whatever the user typed. */
function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) •••-${d.slice(6)}` : "";
}

function PronounField({
  id, label, skipLabel, choice, setChoice, other, setOther,
}: {
  id: string; label: string; skipLabel: string;
  choice: string; setChoice: (v: string) => void; other: string; setOther: (v: string) => void;
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <SelectField id={id} value={choice} onChange={setChoice} options={pronounOptions(skipLabel)} placeholder="Choose one" />
      {choice === OTHER && (
        <input className={`${inputCls} mt-3`} placeholder="Pronouns, in your words" value={other} onChange={(e) => setOther(e.target.value)} />
      )}
    </div>
  );
}

export default function LinkFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("elderPhone");
  const [phone, setPhone] = useState("");
  const [isNewElder, setIsNewElder] = useState(false);
  const [seniorName, setSeniorName] = useState("");
  const [elderPronounChoice, setElderPronounChoice] = useState("");
  const [elderPronounOther, setElderPronounOther] = useState("");
  const [name, setName] = useState("");
  const [pronounChoice, setPronounChoice] = useState("");
  const [pronounOther, setPronounOther] = useState("");
  const [relationship, setRelationship] = useState("");
  const [otherRel, setOtherRel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const elderPhone = phone.trim().startsWith("+") ? phone : phone ? `+1 ${phone}` : "";
  const phoneReady = phone.replace(/\D/g, "").length >= 10;
  const relValue = relationship === "Other" ? otherRel.trim() : relationship;
  const elderPronouns = pronounValue(elderPronounChoice, elderPronounOther, ELDER_SKIP);
  const myPronouns = pronounValue(pronounChoice, pronounOther, MEMBER_SKIP);
  const elderPronounsReady = !!elderPronounChoice && (elderPronounChoice !== OTHER || !!elderPronounOther.trim());
  const myPronounsReady = !!pronounChoice && (pronounChoice !== OTHER || !!pronounOther.trim());

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

  const lookup = () =>
    run(async () => {
      const { status, data } = await post("/api/link/lookup", { phone: elderPhone });
      if (status !== 200) return setError(data.error ?? "Lookup failed");
      setIsNewElder(!data.found);
      setSeniorName(data.found ? data.senior_first_name : "");
      setStep(data.found ? "confirm" : "newElder");
    });

  // Final step: create the loved one if they're new, then join their circle.
  const finish = (reconnect = false) =>
    run(async () => {
      if (isNewElder) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
        const created = await post("/api/link/elders", {
          name: seniorName,
          phone: elderPhone,
          timezone,
          pronouns: elderPronouns || undefined,
        });
        // "That number is already set up" means someone beat us to it: just join them.
        if (created.status !== 200 && created.status !== 409) return setError(created.data.error ?? "Could not set up your loved one");
        if (created.status === 200) setSeniorName(created.data.senior_first_name);
        setIsNewElder(false);
      }
      const { status, data } = await post("/api/link/join", {
        phone: elderPhone,
        name,
        relationship: relValue,
        pronouns: myPronouns || undefined,
        reconnect,
      });
      if (status === 409 && data.exists) return setStep("isThisYou");
      if (status !== 200) return setError(data.error ?? "Could not join");
      saveSession({ member_id: data.member_id, senior_id: data.senior_id, name: name.trim() });
      router.push(data.reconnected ? "/dashboard" : "/questionnaire");
    });

  const errorBox = error && (
    <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-danger">
      {error}
    </p>
  );
  const backFromYou = () => setStep(isNewElder ? "newElder" : "confirm");

  if (step === "confirm")
    return (
      <Screen
        top={<BackButton onClick={() => setStep("elderPhone")} />}
        footer={
          <div className="space-y-1">
            <Button className="w-full" onClick={() => setStep("you")}>
              Yes, that&apos;s them
            </Button>
            <Button variant="text" onClick={() => setStep("elderPhone")}>
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
        </div>
      </Screen>
    );

  if (step === "newElder")
    return (
      <Screen
        top={<BackButton onClick={() => setStep("elderPhone")} />}
        footer={
          <Button className="w-full" disabled={!seniorName.trim() || !elderPronounsReady} onClick={() => setStep("you")}>
            Continue
          </Button>
        }
      >
        <h1 className={headingCls}>Tell us about your loved one</h1>
        <p className={subCls}>We don&apos;t have {elderPhone} yet, so let&apos;s set them up first.</p>
        <div className="mt-8 space-y-5">
          <div>
            <label className={labelCls} htmlFor="elder-name">Their first name</label>
            <input id="elder-name" className={inputCls} value={seniorName} onChange={(e) => setSeniorName(e.target.value)} />
          </div>
          <PronounField
            id="elder-pronouns" label="Their pronouns" skipLabel={ELDER_SKIP}
            choice={elderPronounChoice} setChoice={setElderPronounChoice}
            other={elderPronounOther} setOther={setElderPronounOther}
          />
        </div>
      </Screen>
    );

  if (step === "isThisYou")
    return (
      <Screen
        top={<BackButton onClick={() => setStep("you")} />}
        footer={
          <div className="space-y-1">
            <Button className="w-full" disabled={busy} onClick={() => finish(true)}>
              Yes, that&apos;s me
            </Button>
            <Button variant="text" onClick={() => setStep("you")}>
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

  if (step === "you")
    return (
      <Screen
        top={<BackButton onClick={backFromYou} />}
        footer={
          <Button className="w-full" disabled={busy || !name.trim() || !myPronounsReady || !relValue} onClick={() => finish()}>
            Join {seniorName}&apos;s circle
          </Button>
        }
      >
        <h1 className={headingCls}>Now, about you</h1>
        <p className={subCls}>So {seniorName} and Hope know who&apos;s in their circle.</p>
        <form
          className="mt-8 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && myPronounsReady && relValue && !busy) finish();
          }}
        >
          <div>
            <label className={labelCls} htmlFor="your-name">Your first name</label>
            <input id="your-name" className={inputCls} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <PronounField
            id="your-pronouns" label="Your pronouns" skipLabel={MEMBER_SKIP}
            choice={pronounChoice} setChoice={setPronounChoice}
            other={pronounOther} setOther={setPronounOther}
          />
          <div>
            <label className={labelCls} htmlFor="relationship">How are you related to {seniorName}?</label>
            <SelectField id="relationship" value={relationship} onChange={setRelationship} options={RELATIONSHIPS} placeholder="Choose one" />
            {relationship === "Other" && (
              <input className={`${inputCls} mt-3`} placeholder="Tell us how you're connected" value={otherRel} onChange={(e) => setOtherRel(e.target.value)} />
            )}
          </div>
          <button type="submit" className="hidden" />
        </form>
        {errorBox}
      </Screen>
    );

  // step === "elderPhone"
  return (
    <Screen
      footer={
        <div className="space-y-3">
          <Button className="w-full" disabled={busy || !phoneReady} onClick={lookup}>
            Continue
          </Button>
          <p className="text-center text-sm text-slate">Your family&apos;s details stay private and are never sold.</p>
        </div>
      }
    >
      <div className="pt-4">
        <Logo />
      </div>
      <h1 className={`${headingCls} mt-12`}>What&apos;s your loved one&apos;s phone number?</h1>
      <p className={subCls}>We&apos;ll find the person Hope already calls each day, so you can stay close to how they&apos;re doing.</p>
      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (phoneReady && !busy) lookup();
        }}
      >
        <label className={labelCls} htmlFor="elder-phone">Their phone number</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate">+1</span>
          <input id="elder-phone" className={`${inputCls} pl-12`} inputMode="tel" autoComplete="off" placeholder="(415) 555-0142"
            value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button type="submit" className="hidden" />
      </form>
      {errorBox}
    </Screen>
  );
}
