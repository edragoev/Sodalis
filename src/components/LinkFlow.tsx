"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OTHER, pronounOptions, pronounValue } from "@/lib/pronouns";
import { saveElder } from "@/lib/session";
import DatePicker from "./DatePicker";
import TagInput from "./TagInput";
import { BackButton, Button, Logo, Screen, SelectField, headingCls, inputCls, fieldLabelCls, subCls, textareaCls } from "./ui";

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

/** "(415) 677-8345" from whatever the user typed (falls back to what they typed). */
function prettyPhone(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw.trim();
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
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!notFound) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNotFound(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notFound]);

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
      } else setNotFound(true);
    });

  const createElder = () =>
    run(async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
      const { status, data } = await post("/api/link/elders", {
        name, phone: elderPhone, timezone, pronouns: pronouns || undefined,
        birthday: birthday || undefined, interests, skills, notes,
      });
      if (status === 409) return void (await lookup()); // someone set them up a moment ago: just find them
      if (status !== 200) return setError(data.error ?? "Could not set up the profile");
      saveElder({ senior_id: data.senior_id, name: data.senior_first_name });
      router.push("/profiles");
    });

  const errorBox = error && (
    <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-lg text-danger">
      {error}
    </p>
  );

  if (step === "like")
    return (
      <Screen
        top={<BackButton onClick={() => setStep("about")} />}
        footer={
          <Button className="w-full" disabled={busy} onClick={createElder}>
            {busy ? "Saving…" : `Save ${name.trim()}'s profile`}
          </Button>
        }
      >
        <h1 className={headingCls}>What is {name.trim()} like?</h1>
        <p className={subCls}>This helps Sodalis and your family find the right moments. Skip anything you&apos;re unsure about.</p>
        <div className="mt-8 space-y-7">
          <TagInput id="elder-interests" label="Interests" hint="Things they love" values={interests} onChange={setInterests} suggestions={INTEREST_IDEAS} />
          <TagInput id="elder-skills" label="Skills" hint="Things they're good at" values={skills} onChange={setSkills} suggestions={SKILL_IDEAS} />
          <div>
            <label className={fieldLabelCls} htmlFor="elder-notes">Good to know</label>
            <p className="-mt-1 mb-2 text-sm text-slate">Routines, health, favourite things, names Sodalis should know.</p>
            <textarea
              id="elder-notes"
              className={`${textareaCls} min-h-32`}
              maxLength={2000}
              placeholder="e.g. Naps after lunch. Hard of hearing on the left. Loves her cat, Biscuit."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
        <p className={subCls}>We don&apos;t have {prettyPhone(phone)} yet. Tell us a little about them.</p>
        <div className="mt-8 space-y-6">
          <div>
            <label className={fieldLabelCls} htmlFor="elder-name">Their name</label>
            <input id="elder-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={fieldLabelCls} htmlFor="elder-pronouns">Their pronouns</label>
            <SelectField id="elder-pronouns" value={pronounChoice} onChange={setPronounChoice} options={pronounOptions(ELDER_SKIP)} placeholder="Choose one" blackText />
            {pronounChoice === OTHER && (
              <input className={`${inputCls} mt-3`} placeholder="Their pronouns, in your words" value={pronounOther} onChange={(e) => setPronounOther(e.target.value)} />
            )}
          </div>
          <div>
            <label className={fieldLabelCls} htmlFor="elder-birthday">Their birthday (optional)</label>
            <DatePicker id="elder-birthday" value={birthday} onChange={setBirthday} placeholder="Select their birthday" startYear={1950} />
          </div>
        </div>
      </Screen>
    );

  return (
    <Screen>
      <div className="pt-4">
        <Logo align="left" />
      </div>
      <h1 className={`${headingCls} mt-12`}>What&apos;s your loved one&apos;s phone number?</h1>
      <p className={subCls}>We&apos;ll find the person Sodalis already calls each day, so you can stay close to how they&apos;re doing.</p>
      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (phoneReady && !busy) lookup();
        }}
      >
        <label className={fieldLabelCls} htmlFor="elder-phone">Their phone number</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate">+1</span>
          <input id="elder-phone" className={`${inputCls} pl-12`} inputMode="tel" autoComplete="off" placeholder="(415) 555-0142"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setError(""); // a message about the old number no longer applies
            }} />
        </div>
        {phone.trim() && errorBox}
        {/* Right under the number, so it sits within reach and isn't pushed off screen by the keyboard. */}
        <Button type="submit" className="mt-4 w-full" disabled={busy || !phoneReady}>
          Continue
        </Button>
        <p className="mt-3 text-center text-sm text-slate">Your family&apos;s details stay private and are never sold.</p>
      </form>
      {notFound && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40" onClick={() => setNotFound(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="not-found-title"
            className="sheet-up w-full max-w-md rounded-t-[28px] bg-white px-6 pb-8 pt-3 shadow-[0_-8px_40px_rgba(31,42,41,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-sand" aria-hidden />
            <h2 id="not-found-title" className="font-serif text-2xl font-semibold text-ink">We couldn&apos;t find that number</h2>
            <p className="mt-2 text-lg leading-relaxed text-slate">
              <b className="text-ink">{prettyPhone(phone)}</b> isn&apos;t linked to anyone yet. If it&apos;s a typo, go back and fix it. If it&apos;s right, set up their profile.
            </p>
            <div className="mt-6 space-y-1">
              <Button
                className="w-full"
                autoFocus
                onClick={() => {
                  setNotFound(false);
                  setStep("about");
                }}
              >
                Set up their profile
              </Button>
              <Button variant="text" onClick={() => setNotFound(false)}>
                Re-enter the number
              </Button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
