"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QUESTIONS } from "@/lib/profile-questions";
import { clearSession, getSession } from "@/lib/session";
import LogisticsQuestion from "./LogisticsQuestion";
import SignOutButton from "./SignOutButton";
import { Avatar, Button, Screen, TabBar, inputCls, textareaCls } from "./ui";

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
  const alive = useRef(true); // stops the tag-refresh polling when you leave the page

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    fetch(`/api/members/${s.member_id}/profile`)
      .then((r) => {
        // The saved member may no longer exist (a different database, a deleted profile): start over.
        if (r.status === 404) {
          clearSession();
          router.replace("/");
          return null;
        }
        if (!r.ok) throw new Error("profile request failed");
        return r.json() as Promise<Profile>;
      })
      .then((p) => {
        if (!p) return;
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
      setBusy(false);
      if (data.structuring !== "pending") return void setNote("Saved.");

      // Your answers are saved. The tags are built in the background, so check back for them.
      setNote("Saved. Updating your tags…");
      for (let i = 0; i < 15 && alive.current; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        if (!alive.current) return;
        const check = await fetch(`/api/members/${memberId}/profile`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (check && check.updated_at && check.updated_at !== data.updated_at) {
          setProfile(check);
          return void setNote("Saved. Your tags are up to date.");
        }
      }
      setNote("Saved. Your tags will update shortly.");
    } catch {
      setNote("Couldn't save. Please try again.");
      setBusy(false);
    }
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

  if (!profile) return <p className="p-8 text-slate">{note || "Loading…"}</p>;
  const first = profile.name.split(" ")[0];

  return (
    <Screen tabs={<TabBar active="profile" name={first} />}>
      <header className="flex items-center gap-4">
        <Avatar name={profile.name} size={64} />
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-semibold text-ink">{profile.name}</h1>
          {profile.updated_at && (
            <p className="text-sm text-slate">Updated {new Date(profile.updated_at).toLocaleDateString()}</p>
          )}
        </div>
      </header>
      {profile.summary && <p className="mt-4 text-lg leading-relaxed text-slate">{profile.summary}</p>}

      <section className="mt-8 space-y-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-ink">Your tags</h2>
          <p className="mt-1 text-slate">Edit these any time. They help suggest the right moments to connect.</p>
        </div>
        {TAG_GROUPS.map(({ field, label }) => (
          <div key={field} className="space-y-2">
            <p className="text-sm font-semibold text-ink">{label}</p>
            <div className="flex flex-wrap gap-2">
              {profile.tags[field].map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-mist py-1 pl-3 pr-1 text-primary-dark">
                  {t}
                  <button
                    aria-label={`Remove ${t}`}
                    className="grid h-6 w-6 place-items-center rounded-full hover:bg-primary/10"
                    onClick={() => saveTags(field, profile.tags[field].filter((x) => x !== t))}
                  >
                    ×
                  </button>
                </span>
              ))}
              {!profile.tags[field].length && <span className="text-sm text-slate">None yet</span>}
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
                aria-label={`Add to ${label}`}
                className={`${inputCls} h-11 text-base`}
                placeholder="Add a tag"
                value={drafts[field] ?? ""}
                onChange={(e) => setDrafts({ ...drafts, [field]: e.target.value })}
              />
              <Button variant="secondary" className="h-11 px-5 text-base">
                Add
              </Button>
            </form>
          </div>
        ))}
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">Your answers</h2>
        {QUESTIONS.map((q) =>
          q.key === "logistics" ? (
            <div key={q.key} className="space-y-3">
              <span className="text-sm font-semibold text-ink">{q.text}</span>
              <LogisticsQuestion size="compact" value={answers.logistics ?? ""} onChange={(v) => setAnswers({ ...answers, logistics: v })} />
            </div>
          ) : (
          <label key={q.key} className="block space-y-2">
            <span className="text-sm font-semibold text-ink">{q.text}</span>
            <textarea
              className={`${textareaCls} min-h-24 text-base`}
              maxLength={2000}
              value={answers[q.key] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
            />
          </label>
          ),
        )}
        <Button className="w-full" disabled={busy} onClick={saveAnswers}>
          {busy ? "Saving…" : "Save answers"}
        </Button>
        {note && (
          <p role="status" className="text-slate">
            {note}
          </p>
        )}
        <Button
          variant="text"
          className="text-slate"
          onClick={() => {
            clearSession();
            router.push("/profiles");
          }}
        >
          Switch profile
        </Button>
        <SignOutButton />
      </section>
    </Screen>
  );
}
