"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OTHER, pronounOptions, pronounValue } from "@/lib/pronouns";
import { RELATIONSHIPS } from "@/lib/relationships";
import { clearElder, getElder, saveSession } from "@/lib/session";
import { Avatar, BackButton, Button, Screen, SelectField, headingCls, inputCls, largeInputCls, largeLabelCls, subCls } from "./ui";

type Member = { id: string; name: string; relationship: string; has_answers: boolean };

const MEMBER_SKIP = "Prefer not to say";

// "Who's checking in on Margaret?": one tile per family member, Netflix-style.
export default function ProfilePicker() {
  const router = useRouter();
  const [seniorId, setSeniorId] = useState("");
  const [seniorName, setSeniorName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "adding">("loading");
  const [name, setName] = useState("");
  const [pronounChoice, setPronounChoice] = useState("");
  const [pronounOther, setPronounOther] = useState("");
  const [relationship, setRelationship] = useState("");
  const [otherRel, setOtherRel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/seniors/${id}/members`);
    if (!res.ok) {
      clearElder(); // the saved elder no longer exists: start over
      return void router.replace("/");
    }
    const d = await res.json();
    setSeniorName(d.senior_first_name);
    setMembers(d.members);
    // Nobody here yet: go straight to adding the first profile.
    setState(d.members.length ? "ready" : "adding");
  }, [router]);

  useEffect(() => {
    const e = getElder();
    if (!e) return void router.replace("/");
    queueMicrotask(() => {
      setSeniorId(e.senior_id);
      load(e.senior_id).catch(() => setError("Couldn't load the family. Please try again."));
    });
  }, [router, load]);

  const relValue = relationship === "Other" ? otherRel.trim() : relationship;
  const pronouns = pronounValue(pronounChoice, pronounOther, MEMBER_SKIP);
  const pronounsReady = !!pronounChoice && (pronounChoice !== OTHER || !!pronounOther.trim());
  const canAdd = !!name.trim() && pronounsReady && !!relValue;

  function pick(m: Member) {
    saveSession({ member_id: m.id, senior_id: seniorId, name: m.name });
    router.push(m.has_answers ? "/dashboard" : "/questionnaire");
  }

  async function add() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/seniors/${seniorId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, relationship: relValue, pronouns: pronouns || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.exists) {
        setError(`There's already a profile called ${data.name}. Pick it from the list.`);
        await load(seniorId);
        setState("ready");
      } else if (!res.ok) setError(data.error ?? "Could not add the profile");
      else {
        saveSession({ member_id: data.member_id, senior_id: seniorId, name: name.trim() });
        router.push("/questionnaire");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  if (state === "loading") return <p className="p-8 text-xl text-slate">{error || "Loading…"}</p>;

  if (state === "adding")
    return (
      <Screen
        top={members.length ? <BackButton onClick={() => { setState("ready"); setError(""); }} /> : undefined}
        footer={
          <Button className="w-full" disabled={busy || !canAdd} onClick={add}>
            {busy ? "Adding…" : "Add my profile"}
          </Button>
        }
      >
        <h1 className={headingCls}>Add your profile</h1>
        <p className={`${subCls} text-xl`}>So {seniorName} and Hope know who&apos;s in their circle. Next we&apos;ll ask a few questions about you.</p>
        <div className="mt-8 space-y-6">
          <div>
            <label className={largeLabelCls} htmlFor="member-name">Your first name</label>
            <input id="member-name" className={largeInputCls} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={largeLabelCls} htmlFor="member-pronouns">Your pronouns</label>
            <SelectField id="member-pronouns" value={pronounChoice} onChange={setPronounChoice} options={pronounOptions(MEMBER_SKIP)} placeholder="Choose one" large blackText />
            {pronounChoice === OTHER && (
              <input className={`${inputCls} mt-3`} placeholder="Pronouns, in your words" value={pronounOther} onChange={(e) => setPronounOther(e.target.value)} />
            )}
          </div>
          <div>
            <label className={largeLabelCls} htmlFor="member-rel">How are you related to {seniorName}?</label>
            <SelectField id="member-rel" value={relationship} onChange={setRelationship} options={RELATIONSHIPS} placeholder="Choose one" large blackText />
            {relationship === "Other" && (
              <input className={`${inputCls} mt-3`} placeholder="Tell us how you're connected" value={otherRel} onChange={(e) => setOtherRel(e.target.value)} />
            )}
          </div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-lg text-danger">{error}</p>}
      </Screen>
    );

  return (
    <Screen
      footer={
        <Button
          variant="text"
          className="text-slate"
          onClick={() => {
            clearElder();
            router.push("/");
          }}
        >
          Not {seniorName}&apos;s family? Use a different number
        </Button>
      }
    >
      <h1 className={headingCls}>Who&apos;s checking in on {seniorName}?</h1>
      <p className={`${subCls} text-xl`}>Pick your profile, or add yourself to the circle.</p>
      {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-lg text-danger">{error}</p>}
      <div className="mt-8 grid grid-cols-2 gap-4">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => pick(m)}
            className="flex flex-col items-center gap-3 rounded-3xl border border-sand p-5 text-center transition-colors hover:bg-mist"
          >
            <Avatar name={m.name} size={84} />
            <span className="font-serif text-2xl font-semibold text-ink">{m.name}</span>
            <span className="-mt-2 text-lg text-slate">{m.relationship}</span>
          </button>
        ))}
        <button
          onClick={() => { setState("adding"); setError(""); }}
          className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-sand p-5 text-center text-slate transition-colors hover:bg-mist"
        >
          <span className="grid h-[84px] w-[84px] place-items-center rounded-full bg-cream text-5xl text-primary">+</span>
          <span className="text-xl font-semibold text-ink">Add profile</span>
        </button>
      </div>
    </Screen>
  );
}
