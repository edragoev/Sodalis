"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QUESTIONS } from "@/lib/profile-questions";
import { getSession } from "@/lib/session";
import { Button, Screen, headingCls, subCls, textareaCls } from "./ui";

const HINTS: Record<string, string> = {
  with_elder: "A sentence or two is plenty.",
  interests: "Anything you enjoy, big or small.",
  skills: "We'll use this to suggest the right moments.",
  talk_about: "The things that make you both smile.",
  wish: "No pressure. It just helps us spot the right moment.",
  logistics: "You'll set exact times later in Availability.",
};

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
      router.push("/calendar");
    } catch {
      setError("We couldn't save your answers. Please try again.");
      setSaving(false);
    }
  }

  const next = () => (last ? finish() : setI(i + 1));

  if (!memberId) return null;

  return (
    <Screen
      top={
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm font-medium text-slate">
            <span>
              {i + 1} of {QUESTIONS.length}
            </span>
            <button className="font-semibold text-ink hover:underline disabled:opacity-50" disabled={saving} onClick={next}>
              Skip
            </button>
          </div>
          <div className="h-2 rounded-full bg-sand/60" role="progressbar" aria-valuemin={1} aria-valuemax={QUESTIONS.length} aria-valuenow={i + 1}>
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${((i + 1) / QUESTIONS.length) * 100}%` }} />
          </div>
        </div>
      }
      footer={
        <div className="flex gap-3">
          {i > 0 && (
            <Button variant="secondary" disabled={saving} onClick={() => setI(i - 1)}>
              Back
            </Button>
          )}
          <Button className="flex-1" disabled={saving} onClick={next}>
            {last ? (saving ? "Saving…" : "Finish") : "Next"}
          </Button>
        </div>
      }
    >
      <h1 className={`${headingCls} mt-4`}>{q.text}</h1>
      <p className={subCls}>{HINTS[q.key]}</p>
      <textarea
        aria-label={q.text}
        className={`${textareaCls} mt-6 min-h-40`}
        maxLength={2000}
        value={answers[q.key] ?? ""}
        onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
      />
      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-danger">
          {error}
        </p>
      )}
    </Screen>
  );
}
