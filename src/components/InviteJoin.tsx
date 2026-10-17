"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OTHER, pronounOptions, pronounValue } from "@/lib/pronouns";
import { RELATIONSHIPS } from "@/lib/relationships";
import { saveElder, saveSession } from "@/lib/session";
import { Avatar, BackButton, Button, Logo, Screen, SelectField, headingCls, inputCls, labelCls, subCls } from "./ui";

type State = "loading" | "invalid" | "form" | "isThisYou";

export default function InviteJoin({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [seniorName, setSeniorName] = useState("");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [otherRel, setOtherRel] = useState("");
  const [pronounChoice, setPronounChoice] = useState("");
  const [pronounOther, setPronounOther] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (d?.senior_first_name) {
          setSeniorName(d.senior_first_name);
          setState("form");
        } else setState("invalid");
      });
  }, [token]);

  const relValue = relationship === "Other" ? otherRel.trim() : relationship;
  const myPronouns = pronounValue(pronounChoice, pronounOther, "Prefer not to say");
  const pronounsReady = !!pronounChoice && (pronounChoice !== OTHER || !!pronounOther.trim());

  async function join(reconnect = false) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/invite/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, relationship: relValue, pronouns: myPronouns || undefined, reconnect }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.exists) setState("isThisYou");
      else if (!res.ok) setError(data.error ?? "Could not join");
      else {
        saveSession({ member_id: data.member_id, senior_id: data.senior_id, name: name.trim() });
        saveElder({ senior_id: data.senior_id, name: seniorName });
        router.push(data.reconnected ? "/dashboard" : "/questionnaire");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  if (state === "loading") return <p className="p-8 text-slate">Loading…</p>;

  if (state === "invalid")
    return (
      <Screen
        footer={
          <Button className="w-full" onClick={() => router.push("/")}>
            Start fresh
          </Button>
        }
      >
        <div className="pt-4">
          <Logo />
        </div>
        <h1 className={`${headingCls} mt-12`}>This invite link isn&apos;t valid</h1>
        <p className={subCls}>It may have been copied incompletely. Ask the person who invited you to send it again.</p>
      </Screen>
    );

  if (state === "isThisYou")
    return (
      <Screen
        top={<BackButton onClick={() => setState("form")} />}
        footer={
          <div className="space-y-1">
            <Button className="w-full" disabled={busy} onClick={() => join(true)}>
              Yes, that&apos;s me
            </Button>
            <Button variant="text" onClick={() => setState("form")}>
              No, use a different name
            </Button>
          </div>
        }
      >
        <h1 className={headingCls}>Is this you?</h1>
        <p className={subCls}>
          <b className="text-ink">{name}</b> is already part of {seniorName}&apos;s circle.
        </p>
        {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-danger">{error}</p>}
      </Screen>
    );

  return (
    <Screen
      footer={
        <Button className="w-full" disabled={busy || !name.trim() || !pronounsReady || !relValue} onClick={() => join()}>
          Join {seniorName}&apos;s circle
        </Button>
      }
    >
      <div className="pt-4">
        <Logo />
      </div>
      <div className="mt-10 flex flex-col items-center text-center">
        <Avatar name={seniorName} size={88} />
        <p className="mt-5 text-lg text-slate">You&apos;re invited to join</p>
        <h1 className={headingCls}>{seniorName}&apos;s circle</h1>
        <p className={`${subCls} max-w-xs`}>Hope calls {seniorName} to check in, and you&apos;ll see how it&apos;s going.</p>
      </div>
      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && pronounsReady && relValue && !busy) join();
        }}
      >
        <div>
          <label className={labelCls} htmlFor="invite-name">Your first name</label>
          <input id="invite-name" className={inputCls} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="invite-pronouns">Your pronouns</label>
          <SelectField id="invite-pronouns" value={pronounChoice} onChange={setPronounChoice} options={pronounOptions("Prefer not to say")} placeholder="Choose one" />
          {pronounChoice === OTHER && (
            <input className={`${inputCls} mt-3`} placeholder="Pronouns, in your words" value={pronounOther} onChange={(e) => setPronounOther(e.target.value)} />
          )}
        </div>
        <div>
          <label className={labelCls} htmlFor="invite-rel">How are you related to {seniorName}?</label>
          <SelectField id="invite-rel" value={relationship} onChange={setRelationship} options={RELATIONSHIPS} placeholder="Choose one" />
          {relationship === "Other" && (
            <input className={`${inputCls} mt-3`} placeholder="Tell us how you're connected" value={otherRel} onChange={(e) => setOtherRel(e.target.value)} />
          )}
        </div>
        <button type="submit" className="hidden" />
      </form>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-danger">{error}</p>}
    </Screen>
  );
}
