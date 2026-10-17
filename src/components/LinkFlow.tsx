"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSession } from "@/lib/session";

// 1. Phone number. Found -> the family's profile picker. Not found -> set up the loved one:
// 2. About them (name, pronouns, birthday), 3. What they're like (interests, skills, things to know).
// The loved one is only created at the end of step 3.
type Step = "phone" | "about" | "like";

const ELDER_SKIP = "Not sure";
const INTEREST_IDEAS = ["gardening", "cooking", "cards", "music", "walking", "reading", "knitting", "baking"];
const SKILL_IDEAS = ["cooking", "baking", "sewing", "gardening", "storytelling", "fixing things"];

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

export default function LinkFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pronounChoice, setPronounChoice] = useState("");
  const [pronounOther, setPronounOther] = useState("");
  const [birthday, setBirthday] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const elderPhone = phone.trim().startsWith("+") ? phone : phone ? `+1 ${phone}` : "";
  const phoneReady = phone.replace(/\D/g, "").length >= 10;
  const pronouns = pronounValue(pronounChoice, pronounOther, ELDER_SKIP);
  const aboutReady = !!name.trim() && !!pronounChoice && (pronounChoice !== OTHER || !!pronounOther.trim());

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
      if (data.found) {
        saveElder({ senior_id: data.senior_id, name: data.senior_first_name });
        router.push("/profiles");
      } else setStep("about");
    });

  const createElder = () =>
    run(async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
      const { status, data } = await post("/api/link/elders", {
        name, phone: elderPhone, timezone, pronouns: pronouns || undefined,
        birthday: birthday || undefined, interests, skills, notes,
      });
      if (status === 409 && data.exists) return setStep("isThisYou");
      if (status !== 200) return setError(data.error ?? "Could not join");
      saveSession({ member_id: data.member_id, senior_id: data.senior_id });
      router.push(data.reconnected ? "/dashboard" : "/questionnaire");
    });

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-5 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-stone-900">Sodalis</h1>
        <p className="text-stone-600">Stay close to the person who matters, even from far away.</p>
      </header>

      {step === "phone" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            lookup();
          }}
        >
          <label className="block space-y-2">
            <span className="text-lg font-medium text-stone-800">
              What&apos;s your loved one&apos;s phone number?
            </span>
            <input
              className={input}
              inputMode="tel"
              autoComplete="off"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        {errorBox}
      </Screen>
    );

  if (step === "about")
    return (
      <Screen
        top={<BackButton onClick={() => setStep("phone")} />}
        footer={
          <Button className="w-full" disabled={!aboutReady} onClick={() => setStep("like")}>
            Continue
          </Button>
        }
      >
        <h1 className={headingCls}>Let&apos;s set up your loved one</h1>
        <p className={`${subCls} text-xl`}>We don&apos;t have {elderPhone} yet. Tell us a little about them.</p>
        <div className="mt-8 space-y-6">
          <div>
            <label className={largeLabelCls} htmlFor="elder-name">Their first name</label>
            <input id="elder-name" className={largeInputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={largeLabelCls} htmlFor="elder-pronouns">Their pronouns</label>
            <SelectField id="elder-pronouns" value={pronounChoice} onChange={setPronounChoice} options={pronounOptions(ELDER_SKIP)} placeholder="Choose one" large blackText />
            {pronounChoice === OTHER && (
              <input className={`${inputCls} mt-3`} placeholder="Their pronouns, in your words" value={pronounOther} onChange={(e) => setPronounOther(e.target.value)} />
            )}
          </div>
          <div>
            <label className={largeLabelCls} htmlFor="elder-birthday">Their birthday (optional)</label>
            <input id="elder-birthday" type="date" className={largeInputCls} value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </div>
        </div>
      </Screen>
    );

  return (
    <Screen
      footer={
        <div className="space-y-3">
          <Button className="w-full" disabled={busy || !phoneReady} onClick={lookup}>
            Continue
          </Button>
          <p className="text-center text-xl text-slate">Your family&apos;s details stay private and are never sold.</p>
        </div>
      }
    >
      <div className="flex items-center justify-center pt-4 text-center origin-center scale-125">
        <Logo />
      </div>
      <h1 className={`${headingCls} mt-12`}>What&apos;s your loved one&apos;s phone number?</h1>
      <p className={`${subCls} text-xl`}>We&apos;ll find the person Hope already calls each day, so you can stay close to how they&apos;re doing.</p>
      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (phoneReady && !busy) lookup();
        }}
      >
        <label className={largeLabelCls} htmlFor="elder-phone">Their phone number</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate">+1</span>
          <input id="elder-phone" className={`${largeInputCls} pl-12`} inputMode="tel" autoComplete="off" placeholder="(415) 555-0142"
            value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button type="submit" className="hidden" />
      </form>
      {errorBox}
    </Screen>
  );
}
