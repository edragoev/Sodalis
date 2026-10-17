"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QUESTIONS } from "@/lib/profile-questions";
import { getSession } from "@/lib/session";
import { ghostCls, inputCls, primaryCls } from "./ui";

type TagField = "activities_with_elder" | "interests" | "skills" | "conversation_topics";
type Profile = {
  name: string;
  answers: Record<string, string>;
  tags: Record<TagField, string[]>;
  summary: string | null;
  updated_at: string | null;
};

const TAG_GROUPS: { field: TagField; label: string }[] = [
  { field: "activities_with_elder", label: "Things you do together" },
  { field: "interests", label: "Interests" },
  { field: "skills", label: "Skills" },
  { field: "conversation_topics", label: "Things you talk about" },
];

export default function ProfileScreen() {
  const router = useRouter();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    fetch(`/api/members/${s.member_id}/profile`)
      .then((r) => r.json())
      .then((p: Profile) => {
        setMemberId(s.member_id);
        setProfile(p);
        setAnswers(p.answers ?? {});
      })
      .catch(() => setNote("Couldn't load your profile."));
  }, [router]);

  async function saveAnswers() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/members/${memberId}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setProfile(data);
      setNote(
        data.structuring === "failed"
          ? "Saved. We'll finish building your tags next time you visit."
          : "Saved.",
      );
    } catch {
      setNote("Couldn't save. Please try again.");
    }
    setBusy(false);
  }

  async function saveTags(field: TagField, tags: string[]) {
    if (!profile) return;
    setProfile({ ...profile, tags: { ...profile.tags, [field]: tags } });
    try {
      const res = await fetch(`/api/members/${memberId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: tags }),
      });
      if (!res.ok) throw new Error();
      setProfile(await res.json());
    } catch {
      setNote("Couldn't save that tag change.");
    }
  }

  if (!profile) return <p className="p-8 text-stone-600">{note || "Loading…"}</p>;

  return (
    <div className="mx-auto w-full max-w-md space-y-8 px-5 py-12">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-stone-900">{profile.name}&apos;s profile</h1>
        {profile.summary && <p className="text-stone-700">{profile.summary}</p>}
        {profile.updated_at && (
          <p className="text-sm text-stone-500">Last updated {new Date(profile.updated_at).toLocaleString()}</p>
        )}
      </header>

      <section className="space-y-5">
        <h2 className="text-xl font-semibold text-stone-900">Your tags</h2>
        <p className="text-sm text-stone-600">Edit these any time. We use them to suggest the right moments to connect.</p>
        {TAG_GROUPS.map(({ field, label }) => (
          <div key={field} className="space-y-2">
            <p className="font-medium text-stone-800">{label}</p>
            <div className="flex flex-wrap gap-2">
              {profile.tags[field].map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-teal-100 py-1 pl-3 pr-1 text-teal-900">
                  {t}
                  <button
                    aria-label={`Remove ${t}`}
                    className="rounded-full px-2 text-teal-800 hover:bg-teal-200"
                    onClick={() => saveTags(field, profile.tags[field].filter((x) => x !== t))}
                  >
                    ×
                  </button>
                </span>
              ))}
              {!profile.tags[field].length && <span className="text-sm text-stone-500">None yet</span>}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = (drafts[field] ?? "").trim().toLowerCase();
                if (v && !profile.tags[field].includes(v)) saveTags(field, [...profile.tags[field], v]);
                setDrafts({ ...drafts, [field]: "" });
              }}
            >
              <input
                className={`${inputCls} py-2 text-base`}
                placeholder="Add a tag"
                value={drafts[field] ?? ""}
                onChange={(e) => setDrafts({ ...drafts, [field]: e.target.value })}
              />
              <button className="rounded-xl border border-teal-700 px-4 text-teal-800">Add</button>
            </form>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-stone-900">Your answers</h2>
        {QUESTIONS.map((q) => (
          <label key={q.key} className="block space-y-1">
            <span className="text-stone-800">{q.text}</span>
            <textarea
              className={`${inputCls} min-h-20 text-base`}
              maxLength={2000}
              value={answers[q.key] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
            />
          </label>
        ))}
        <button className={primaryCls} disabled={busy} onClick={saveAnswers}>
          {busy ? "Saving…" : "Save answers"}
        </button>
        {note && (
          <p role="status" className="text-stone-700">
            {note}
          </p>
        )}
        <button className={ghostCls} onClick={() => router.push("/dashboard")}>
          Back to dashboard
        </button>
      </section>
    </div>
  );
}
