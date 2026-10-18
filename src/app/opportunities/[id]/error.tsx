"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Screen, primaryCls, subCls } from "@/components/ui";

// Shown instead of a blank "Application error" when the idea page throws while rendering.
export default function OpportunityError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("opportunity page crashed", error);
  }, [error]);

  return (
    <Screen>
      <p className={subCls}>Something went wrong showing this idea.</p>
      <button type="button" className={`${primaryCls} mt-8`} onClick={() => retry()}>
        Try again
      </button>
      <Link href="/dashboard" className="mt-4 flex h-12 items-center justify-center text-lg font-semibold text-slate hover:underline">
        Back to home
      </Link>
    </Screen>
  );
}
