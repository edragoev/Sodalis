"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getElder, getSession } from "@/lib/session";

// Returning members skip onboarding: signed in -> dashboard, known family -> profile picker.
export default function RedirectIfLinked() {
  const router = useRouter();
  useEffect(() => {
    if (getSession()) router.replace("/dashboard");
    else if (getElder()) router.replace("/profiles");
  }, [router]);
  return null;
}
