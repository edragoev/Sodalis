"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSession } from "@/lib/session";

// Returning members (already linked on this device) skip onboarding.
export default function RedirectIfLinked() {
  const router = useRouter();
  useEffect(() => {
    if (getSession()) router.replace("/dashboard");
  }, [router]);
  return null;
}
