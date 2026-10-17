"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/session";
import { Screen, TabBar, headingCls, subCls } from "./ui";

// Placeholder until the availability grid and Google Calendar connection are built.
export default function Availability() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    queueMicrotask(() => setName(s.name?.split(" ")[0] ?? ""));
  }, [router]);

  return (
    <Screen tabs={<TabBar active="availability" name={name} />}>
      <h1 className={headingCls}>Availability</h1>
      <p className={subCls}>Soon you&apos;ll tell us when you&apos;re free, so we can suggest visits and calls that fit your week.</p>
    </Screen>
  );
}
