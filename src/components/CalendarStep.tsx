"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSession } from "@/lib/session";
import { Button, Screen, headingCls, subCls } from "./ui";

// Optional last onboarding step. Google Calendar sign-in isn't wired yet, so it's
// shown as coming soon; the manual grid on the Availability tab is the fallback.
export default function CalendarStep() {
  const router = useRouter();

  useEffect(() => {
    if (!getSession()) router.replace("/");
  }, [router]);

  return (
    <Screen
      footer={
        <div className="space-y-1">
          <Button className="w-full" onClick={() => router.push("/availability")}>
            Set my free times
          </Button>
          <Button variant="text" onClick={() => router.push("/dashboard")}>
            Skip for now
          </Button>
        </div>
      }
    >
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-mist text-primary">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        </svg>
      </div>
      <h1 className={`${headingCls} mt-6`}>When are you free?</h1>
      <p className={subCls}>
        Share your availability and we&apos;ll suggest visits and calls that fit your week. We only look at when you&apos;re busy, never what the events are.
      </p>
      <button
        disabled
        className="mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-sand bg-white text-lg font-semibold text-slate opacity-70"
      >
        Connect Google Calendar
        <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs font-semibold text-primary-dark">Coming soon</span>
      </button>
      <p className="mt-4 text-sm text-slate">You can do this any time from the Availability tab.</p>
    </Screen>
  );
}
