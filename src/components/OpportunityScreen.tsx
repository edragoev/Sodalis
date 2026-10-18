"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { confirmSlot, type ConfirmParams, type ConfirmResult } from "@/lib/confirm-slot";
import { loadOpportunity } from "@/lib/load-opportunity";
import { buildOpportunityView, type OpportunityData, type OpportunityView } from "@/lib/opportunity-view";
import { getSession, type Session } from "@/lib/session";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Screen, headingCls, primaryCls, subCls } from "./ui";

type Props = {
  opportunityId: string;
  // Injected in tests; by default the real session, database and API are used.
  session?: Session | null;
  load?: (id: string) => Promise<OpportunityData | null>;
  confirm?: (params: ConfirmParams) => Promise<ConfirmResult>;
};

type Outcome =
  | { kind: "none" }
  | { kind: "done"; label: string }
  | { kind: "covered"; by: string | null }
  | { kind: "error" };

const defaultLoad = (id: string) => loadOpportunity(supabaseBrowser(), id);

const CLOSED_MESSAGES: Partial<Record<OpportunityView["state"], string>> = {
  declined: "This idea was declined.",
  expired: "This idea has expired.",
  preparing: "Sodalis is still working on this idea. Check back soon.",
};

// The one line of status under the quote: what just happened, or how the idea stands.
function statusMessage(view: OpportunityView, outcome: Outcome): string | null {
  if (outcome.kind === "done") return `You're all set — ${outcome.label}.`;
  if (outcome.kind === "covered") return `Already covered by ${outcome.by ?? "someone"}.`;
  if (view.state === "claimed") return `${view.claimedBy} is covering this.`;
  if (view.state === "claimed_by_me") return "You're covering this.";
  return CLOSED_MESSAGES[view.state] ?? null;
}

export default function OpportunityScreen({
  opportunityId,
  session: sessionProp,
  load = defaultLoad,
  confirm = confirmSlot,
}: Props) {
  // The stored session is read after mounting, never while rendering: the server has no
  // localStorage, so deciding here would make the server HTML and the first browser render differ.
  // undefined means "not read yet", and shows "Loading…" like the server did.
  const [stored, setStored] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (sessionProp === undefined) queueMicrotask(() => setStored(getSession()));
  }, [sessionProp]);
  const session = sessionProp !== undefined ? sessionProp : stored;
  const [data, setData] = useState<OpportunityData | null | undefined>(undefined); // undefined = loading
  const [loadFailed, setLoadFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const inFlight = useRef(false); // a second press must not slip in before React re-renders

  useEffect(() => {
    if (!session) return; // nothing private is fetched for someone who has not linked
    let active = true;
    load(opportunityId)
      .then((d) => active && setData(d))
      .catch(() => active && setLoadFailed(true));
    return () => {
      active = false;
    };
  }, [opportunityId, session, load]);

  if (session === undefined) return <p className="p-8 text-xl text-slate">Loading…</p>;
  if (!session) {
    return (
      <Screen>
        <h1 className={headingCls}>One quick step first</h1>
        <p className={`${subCls} text-xl`}>Link your account to see this idea.</p>
        <Link href="/" className={`${primaryCls} mt-8 flex items-center justify-center`}>
          Link your account
        </Link>
      </Screen>
    );
  }
  if (loadFailed) return <p role="alert" className="p-8 text-xl text-danger">Couldn&apos;t load this idea. Try again.</p>;
  if (data === undefined) return <p className="p-8 text-xl text-slate">Loading…</p>;
  if (data === null) {
    return (
      <Screen>
        <p className={`${subCls} text-xl`}>We couldn&apos;t find that idea.</p>
      </Screen>
    );
  }

  const view = buildOpportunityView(data, session);
  if (view.state === "not_your_family") {
    return (
      <Screen>
        <p className={`${subCls} text-xl`}>This idea belongs to another family.</p>
      </Screen>
    );
  }

  async function onConfirm(slotId: string, label: string) {
    if (inFlight.current || !session) return;
    inFlight.current = true;
    setSending(true);
    setOutcome({ kind: "none" });
    const result = await confirm({ opportunity_id: opportunityId, slot_id: slotId, member_id: session.member_id });
    inFlight.current = false;
    setSending(false);
    if (result.ok) setOutcome({ kind: "done", label });
    else if (result.reason === "already_covered") setOutcome({ kind: "covered", by: result.coveredBy });
    else setOutcome({ kind: "error" });
  }

  const status = statusMessage(view, outcome);

  const showSlots = view.canConfirm && outcome.kind !== "done" && outcome.kind !== "covered";

  const confirmed = view.state === "claimed" || view.state === "claimed_by_me" || outcome.kind === "done";

  return (
    <Screen
      footer={
        <Link href="/dashboard" className="flex h-12 items-center justify-center text-lg font-semibold text-slate hover:underline">
          Back to home
        </Link>
      }
    >
      <h1 className={headingCls}>{view.title}</h1>
      {view.quote && (
        <blockquote className="mt-6 rounded-3xl bg-mist p-5 font-serif text-2xl leading-snug text-ink">
          “{view.quote}”
        </blockquote>
      )}
      {status && (
        <p
          className={`mt-6 rounded-2xl p-4 text-xl text-ink ${
            confirmed ? "border border-good/30 bg-mist" : outcome.kind === "covered" ? "bg-peach" : "bg-cream"
          }`}
        >
          {status}
        </p>
      )}
      {outcome.kind === "error" && (
        <p role="alert" className="mt-4 rounded-2xl bg-danger-bg p-3 text-lg text-danger">Something went wrong. Please try again.</p>
      )}
      {showSlots && (
        <div className="mt-8">
          <h2 className="font-serif text-2xl font-semibold text-ink">Pick a time</h2>
          <ul className="mt-3 space-y-3">
            {view.slots.map((slot) => (
              <li key={slot.id}>
                <button
                  type="button"
                  className={primaryCls}
                  disabled={sending}
                  onClick={() => onConfirm(slot.id, slot.label)}
                >
                  Confirm {slot.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Screen>
  );
}
