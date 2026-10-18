"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSession } from "@/lib/session";
import { Button, Screen, headingCls, subCls } from "./ui";

export default function CalendarStep() {
  const router = useRouter();

  useEffect(() => {
    if (!getSession()) router.replace("/");
  }, [router]);

  return (
    <Screen
      top={
        <button onClick={() => router.push("/dashboard")} className="-ml-1 px-1 py-2 text-base font-semibold text-slate hover:text-ink hover:underline">
          Skip
        </button>
      }
    >
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-mist text-primary">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        </svg>
      </div>
      <h1 className={`${headingCls} mt-6`}>Add your calendar?</h1>
      <p className={subCls}>
        Upload your Google Calendar and we&apos;ll suggest visits and calls between 9am and 8pm when you&apos;re not busy. You can skip
        this and add it later.
      </p>

      <div className="mt-8 space-y-3">
        <Button className="w-full" onClick={() => router.push("/availability")}>
          Upload my calendar
        </Button>
      </div>

    </Screen>
  );
}
