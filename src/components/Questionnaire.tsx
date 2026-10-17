"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QUESTIONS } from "@/lib/profile-questions";
import { getSession } from "@/lib/session";
import { ghostCls, inputCls, primaryCls } from "./ui";

export default function Questionnaire() {
  const router = useRouter();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    fetch(`/api/members/${s.member_id}/profile`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((p) => {
        setMemberId(s.member_id);
        if (p?.answers) setAnswers(p.answers);
      });
  }, [router]);

  const q = QUESTIONS[i];
  const last = i === QUESTIONS.length - 1;

  async function finish() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/members/${memberId}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error();
      router.push("/profile");
    } catch {
      setError("We couldn't save your answers. Please try again.");
      setSaving(false);
    }
  }

  function next() {
    if (last) finish();
    else setI(i + 1);
  }

  if (!memberId) return null;

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-5 py-12">
      <div className="space-y-2">
        <p className="text-sm text-stone-500">
          Question {i + 1} of {QUESTIONS.length}
        </p>
        <div className="h-1.5 rounded-full bg-stone-200">
          <div className="h-1.5 rounded-full bg-teal-700 transition-all" style={{ width: `${((i + 1) / QUESTIONS.length) * 100}%` }} />
        </div>
      </div>

      <label className="block space-y-3">
        <span className="text-2xl font-semibold text-stone-900">{q.text}</span>
        <textarea
          className={`${inputCls} min-h-32`}
          maxLength={2000}
          placeholder="A sentence or two is plenty"
          value={answers[q.key] ?? ""}
          onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <button className={primaryCls} disabled={saving} onClick={next}>
          {last ? (saving ? "Saving…" : "Finish") : "Next"}
        </button>
        {i > 0 && (
          <button className={ghostCls} onClick={() => setI(i - 1)}>
            Back
          </button>
        )}
        <button className={ghostCls} disabled={saving} onClick={() => (memberId ? finish() : null)}>
          Skip the rest for now
        </button>
      </div>
    </div>
  );
}
