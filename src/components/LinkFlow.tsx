"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSession } from "@/lib/session";

type Step = "phone" | "confirm" | "newElder" | "you" | "isThisYou";

const RELATIONSHIPS = ["Child", "Grandchild", "Sibling", "Friend", "Other"];
const NOT_FOUND = "We couldn't find that number.";

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const input =
  "w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20";
const primary =
  "w-full rounded-xl bg-teal-700 px-4 py-3 text-lg font-medium text-white hover:bg-teal-800 disabled:opacity-50";

export default function LinkFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [seniorName, setSeniorName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      const { status, data } = await post("/api/link/lookup", { phone });
      if (status !== 200) return setError(data.error ?? "Lookup failed");
      if (data.found) {
        setSeniorName(data.senior_first_name);
        setStep("confirm");
      } else setError(NOT_FOUND);
    });

  const createElder = () =>
    run(async () => {
      const { status, data } = await post("/api/link/elders", { name: seniorName, phone, timezone });
      if (status !== 200) return setError(data.error ?? "Could not create elder");
      setSeniorName(data.senior_first_name);
      setStep("you");
    });

  const join = (reconnect = false) =>
    run(async () => {
      const { status, data } = await post("/api/link/join", {
        phone,
        name,
        relationship,
        member_phone: memberPhone || undefined,
        reconnect,
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
          </label>
          <button className={primary} disabled={busy || !phone.trim()}>
            Continue
          </button>
          {error === NOT_FOUND && (
            <div className="space-y-3 rounded-xl bg-amber-50 p-4">
              <p role="alert" className="text-stone-800">
                {NOT_FOUND} Demo: set up a new elder with this number?
              </p>
              <button
                type="button"
                className="rounded-lg border border-teal-700 px-4 py-2 text-teal-800"
                onClick={() => {
                  setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || timezone);
                  setSeniorName("");
                  setError("");
                  setStep("newElder");
                }}
              >
                Set up a new elder
              </button>
            </div>
          )}
        </form>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <p className="text-xl text-stone-800">
            Linking to <b>{seniorName}</b>
          </p>
          <button className={primary} onClick={() => setStep("you")}>
            Yes, that&apos;s them
          </button>
          <button className="w-full text-stone-600 underline" onClick={() => setStep("phone")}>
            Use a different number
          </button>
        </div>
      )}

      {step === "newElder" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createElder();
          }}
        >
          <p className="text-stone-700">New elder at {phone}</p>
          <input className={input} placeholder="Their name" value={seniorName} onChange={(e) => setSeniorName(e.target.value)} />
          <input className={input} placeholder="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          <button className={primary} disabled={busy || !seniorName.trim()}>
            Create
          </button>
        </form>
      )}

      {step === "you" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <p className="text-xl text-stone-800">Tell {seniorName} who you are</p>
          <input className={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {RELATIONSHIPS.map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRelationship(r)}
                className={`rounded-full border px-4 py-2 ${
                  relationship === r
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-stone-300 bg-white text-stone-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input className={input} placeholder="Or type your relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
          <input className={input} inputMode="tel" placeholder="Your phone (optional)" value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} />
          <button className={primary} disabled={busy || !name.trim() || !relationship.trim()}>
            Join the family
          </button>
        </form>
      )}

      {step === "isThisYou" && (
        <div className="space-y-4">
          <p className="text-xl text-stone-800">
            Is this you? <b>{name}</b> is already linked to {seniorName}.
          </p>
          <button className={primary} disabled={busy} onClick={() => join(true)}>
            Yes, that&apos;s me
          </button>
          <button className="w-full text-stone-600 underline" onClick={() => setStep("you")}>
            No, use a different name
          </button>
        </div>
      )}

      {error && error !== NOT_FOUND && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
