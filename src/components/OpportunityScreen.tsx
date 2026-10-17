"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { confirmSlot, type ConfirmParams, type ConfirmResult } from "@/lib/confirm-slot";
import { loadOpportunity } from "@/lib/load-opportunity";
import { buildOpportunityView, type OpportunityData } from "@/lib/opportunity-view";
import { getSession, type Session } from "@/lib/session";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { primaryCls } from "./ui";

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

const closed: Record<string, string> = {
  declined: "This idea was declined.",
  expired: "This idea has expired.",
  preparing: "Hope is still working on this idea. Check back soon.",
};

export default function OpportunityScreen({
  opportunityId,
  session: sessionProp,
  load = defaultLoad,
  confirm = confirmSlot,
}: Props) {
  const [session] = useState(() => (sessionProp !== undefined ? sessionProp : getSession()));
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

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4 px-5 py-10">
        <p className="text-lg text-stone-800">Link your account to see this idea.</p>
        <Link href="/" className="text-teal-800 underline">Link your account</Link>
      </div>
    );
  }
  if (loadFailed) return <p role="alert" className="p-8 text-red-800">Couldn&apos;t load this idea. Try again.</p>;
  if (data === undefined) return <p className="p-8 text-stone-600">Loading…</p>;
  if (data === null) return <p className="p-8 text-stone-700">We couldn&apos;t find that idea.</p>;

  const view = buildOpportunityView(data, session);
  if (view.state === "not_your_family") {
    return <p className="p-8 text-stone-700">This idea belongs to another family.</p>;
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

  let status: string | null = null;
  if (outcome.kind === "done") status = `You're all set — ${outcome.label}.`;
  else if (outcome.kind === "covered") status = `Already covered by ${outcome.by ?? "someone"}.`;
  else if (view.state === "claimed") status = `${view.claimedBy} is covering this.`;
  else if (view.state === "claimed_by_me") status = "You're covering this.";
  else if (closed[view.state]) status = closed[view.state];

  const showSlots = view.canConfirm && outcome.kind !== "done" && outcome.kind !== "covered";

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-5 py-10">
      <h1 className="text-3xl font-semibold text-stone-900">{view.title}</h1>
      {view.quote && (
        <blockquote className="border-l-4 border-teal-700 pl-4 text-lg text-stone-700">
          “{view.quote}”
        </blockquote>
      )}
      {status && <p className="text-lg text-stone-900">{status}</p>}
      {outcome.kind === "error" && (
        <p role="alert" className="text-red-800">Something went wrong. Please try again.</p>
      )}
      {showSlots && (
        <ul className="space-y-3">
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
      )}
    </div>
  );
}
