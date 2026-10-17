"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Slot, OpportunityStatus, OpportunityType, normalizeSlots, opportunityTitle } from "@/lib/opportunities";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getSession } from "@/lib/session";
import { BackButton, Button, Screen, headingCls, subCls } from "./ui";

type Opportunity = {
  id: string;
  senior_id: string;
  type: OpportunityType;
  summary: string;
  quote: string | null;
  mentioned_item: string | null;
  interest_tags: string[] | null;
  suggested_kind: "visit" | "call" | null;
  proposed_slots: unknown;
  status: OpportunityStatus;
  accepted_by: string | null;
};
type Done = { name: string; starts_at: string | null; kind: string | null; you: boolean };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function OpportunityDetail({ id }: { id: string }) {
  const router = useRouter();
  const [session, setSession] = useState<{ member_id: string; senior_id: string } | null>(null);
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [elder, setElder] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [picked, setPicked] = useState("");
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  async function load(s: { member_id: string; senior_id: string }) {
    const db = supabaseBrowser();
    const [o, m, e] = await Promise.all([
      db.from("opportunities")
        .select("id, senior_id, type, summary, quote, mentioned_item, interest_tags, suggested_kind, proposed_slots, status, accepted_by")
        .eq("id", id).maybeSingle(),
      db.from("family_members").select("id, name").eq("senior_id", s.senior_id),
      db.from("seniors").select("name").eq("id", s.senior_id).maybeSingle(),
    ]);
    // Only opportunities for the elder this device is linked to.
    if (o.error || !o.data || o.data.senior_id !== s.senior_id) return setState("missing");
    const row = o.data as Opportunity;
    setOpp(row);
    setSlots(normalizeSlots(row.proposed_slots));
    setNames(Object.fromEntries((m.data ?? []).map((x) => [x.id, x.name.split(" ")[0]])));
    setElder(e.data?.name?.split(" ")[0] ?? "");
    setNow(Date.now());
    if (row.status === "confirmed" && row.accepted_by) {
      const { data: v } = await db.from("visits").select("starts_at, kind").eq("opportunity_id", id).eq("status", "confirmed").limit(1).maybeSingle();
      setDone({
        name: (m.data ?? []).find((x) => x.id === row.accepted_by)?.name?.split(" ")[0] ?? "Someone",
        starts_at: v?.starts_at ?? null,
        kind: v?.kind ?? null,
        you: row.accepted_by === s.member_id,
      });
    }
    setState("ready");
  }

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    queueMicrotask(() => {
      setSession(s);
      load(s).catch(() => setState("missing"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  const back = () => (window.history.length > 1 ? router.back() : router.push("/dashboard"));

  async function confirm() {
    if (!session || !picked) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/schedule/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunity_id: id, slot_id: picked, member_id: session.member_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const slot = slots.find((s) => s.id === picked);
        setDone({ name: "You", starts_at: slot?.starts_at ?? null, kind: data.kind ?? opp?.suggested_kind ?? null, you: true });
        setOpp((o) => (o ? { ...o, status: "confirmed", accepted_by: session.member_id } : o));
      } else if (res.status === 409) {
        await load(session); // shows who got there first
      } else setError(data.error ?? "Could not confirm. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  if (state === "loading") return <p className="p-8 text-slate">Loading…</p>;
  if (state === "missing" || !opp || !session)
    return (
      <Screen top={<BackButton onClick={back} />}>
        <h1 className={headingCls}>We couldn&apos;t find that idea</h1>
        <p className={subCls}>It may have expired, or it belongs to a family you&apos;re not linked to.</p>
      </Screen>
    );

  const name = elder || "They";
  const open = slots.filter((s) => Date.parse(s.starts_at) > now);
  const mine = open.filter((s) => !s.member_id || s.member_id === session.member_id);
  const others = open.filter((s) => s.member_id && s.member_id !== session.member_id);
  const kindWord = (done?.kind ?? opp.suggested_kind) === "call" ? "calling" : "visiting";

  return (
    <Screen
      top={<BackButton onClick={back} />}
      footer={
        opp.status === "proposed" && mine.length > 0 ? (
          <div className="space-y-1">
            <Button className="w-full" disabled={busy || !picked} onClick={confirm}>
              {busy ? "Confirming…" : "Confirm this time"}
            </Button>
            <Button variant="text" onClick={() => router.push("/dashboard")}>
              Not this time
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => router.push("/dashboard")}>
            Back to home
          </Button>
        )
      }
    >
      <h1 className={headingCls}>{opportunityTitle(opp.type, opp.mentioned_item, name)}</h1>

      {opp.quote && (
        <figure className="mt-6 rounded-3xl bg-mist p-5">
          <blockquote className="font-serif text-2xl leading-snug text-ink">&ldquo;{opp.quote}&rdquo;</blockquote>
          <figcaption className="mt-2 text-sm text-slate">{name}, on a call with Hope</figcaption>
        </figure>
      )}
      <p className="mt-4 text-lg leading-relaxed text-ink">{opp.summary}</p>
      {!!opp.interest_tags?.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {opp.interest_tags.map((t) => (
            <span key={t} className="rounded-full bg-mist px-3 py-1 text-sm text-primary-dark">{t}</span>
          ))}
        </div>
      )}

      {opp.status === "confirmed" && done && (
        <div role="status" className="mt-6 rounded-3xl border border-good/30 bg-mist p-5">
          <p className="font-serif text-2xl font-semibold text-ink">
            {done.you ? "You're on it" : `Already covered by ${done.name}`}
          </p>
          <p className="mt-1 text-lg text-ink">
            {done.you ? `You're ${kindWord} ${name}` : `${done.name} is ${kindWord} ${name}`}
            {done.starts_at ? ` on ${when(done.starts_at)}.` : "."}
          </p>
        </div>
      )}

      {(opp.status === "expired" || opp.status === "declined") && (
        <p className="mt-6 rounded-2xl bg-warn-bg p-4 text-ink">This idea is no longer open.</p>
      )}

      {opp.status === "proposed" && (
        <section className="mt-8">
          <h2 className="font-serif text-2xl font-semibold text-ink">Pick a time</h2>
          {mine.length > 0 ? (
            <div role="radiogroup" aria-label="Available times" className="mt-3 space-y-3">
              {mine.map((s) => {
                const on = picked === s.id;
                return (
                  <button
                    key={s.id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked(s.id)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left text-lg transition-colors ${
                      on ? "border-primary bg-mist" : "border-sand bg-white hover:bg-cream"
                    }`}
                  >
                    <span className="font-semibold text-ink">{when(s.starts_at)}</span>
                    <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${on ? "border-primary bg-primary text-white" : "border-sand"}`}>
                      {on && <span className="text-xs">✓</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-slate">
              {others.length
                ? `These times were suggested for ${[...new Set(others.map((s) => names[s.member_id!] ?? "someone else"))].join(" and ")}.`
                : "There are no upcoming times to choose from."}
            </p>
          )}
          {mine.length > 0 && others.length > 0 && (
            <p className="mt-3 text-sm text-slate">Other times were suggested for someone else in the family.</p>
          )}
          {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-danger">{error}</p>}
        </section>
      )}
    </Screen>
  );
}
