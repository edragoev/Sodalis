"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/session";
import ImportedCalendar from "./ImportedCalendar";
import { Screen, TabBar, headingCls, subCls } from "./ui";

// The member's calendar. Suggested times are 9am to 8pm when nothing on it is booked
// (src/lib/scheduler/slots.ts FREE_HOURS); there is no grid of free times to fill in.
export default function Availability() {
  const router = useRouter();
  const [memberId, setMemberId] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    queueMicrotask(() => {
      setMemberId(s.member_id);
      setName(s.name?.split(" ")[0] ?? "");
    });
  }, [router]);

  if (!memberId) return <p className="p-8 text-slate">Loading…</p>;

  return (
    <Screen
      top={
        <Link href="/schedule" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <span aria-hidden>←</span>
          Calendar
        </Link>
      }
      tabs={<TabBar active="calendar" name={name} />}
    >
      <h1 className={headingCls}>When you&apos;re free</h1>
      <p className={subCls}>
        Upload your calendar and we&apos;ll suggest times between 9am and 8pm when you&apos;re not busy. Without one, any time in
        those hours can be suggested, and you always pick the one that works.
      </p>

      <ImportedCalendar memberId={memberId} />
    </Screen>
  );
}
