"use client";

import Link from "next/link";
import { useState } from "react";

export type Alert = {
  id: string;
  type: string;
  severity: "info" | "warn" | "urgent";
  message: string;
  created_at: string;
  check_in_id: string | null;
};

const STYLE: Record<Alert["severity"], { card: string; icon: string; label: string; text: string }> = {
  urgent: { card: "border-danger/30 bg-danger-bg", icon: "bg-danger/15 text-danger", label: "Needs attention", text: "text-danger" },
  warn: { card: "border-warn/30 bg-warn-bg", icon: "bg-warn/15 text-warn", label: "Worth a look", text: "text-warn" },
  info: { card: "border-sand bg-white", icon: "bg-mist text-primary", label: "Update", text: "text-primary" },
};

/**
 * One dashboard alert with an X that dismisses it for the whole family. `prominent` is the large
 * card used for the most important alert; the rest are compact. The card calls the dismiss route
 * itself and tells the parent through onDismissed, so the parent only removes it from its list.
 */
export default function AlertCard({
  alert,
  memberId,
  time,
  prominent = false,
  onDismissed,
}: {
  alert: Alert;
  memberId: string;
  /** Already formatted, e.g. "Today, 3:03 AM". */
  time: string;
  prominent?: boolean;
  onDismissed: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const s = STYLE[alert.severity] ?? STYLE.info;

  async function dismiss() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/alerts/${alert.id}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId }),
      });
      if (!res.ok) throw new Error();
      onDismissed(alert.id);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const close = (
    <button
      type="button"
      aria-label="Dismiss alert"
      disabled={busy || !memberId}
      onClick={dismiss}
      className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate transition-colors hover:bg-black/5 hover:text-ink disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
  const problem = failed && <p role="alert" className="mt-2 text-sm text-danger">Couldn&apos;t dismiss it. Please try again.</p>;

  if (!prominent) {
    return (
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${s.card}`}>
        <div className="min-w-0 flex-1">
          <p className="text-ink">{alert.message}</p>
          <p className="text-xs text-slate">{time}</p>
          {problem}
        </div>
        {close}
      </div>
    );
  }

  return (
    <div className={`rounded-3xl border p-5 ${s.card}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${s.icon}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l10 18H2L12 3ZM12 10v5M12 18v.5" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${s.text}`}>
            {s.label} · {time}
          </p>
          <p className="mt-1 text-lg font-semibold leading-snug text-ink">{alert.message}</p>
          {alert.check_in_id && (
            <Link
              href={`/calls/${alert.check_in_id}`}
              className="mt-3 inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-ink hover:bg-cream"
            >
              Read the call
            </Link>
          )}
          {problem}
        </div>
        {close}
      </div>
    </div>
  );
}
