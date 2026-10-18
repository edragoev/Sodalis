"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearElder, clearSession } from "@/lib/session";
import { Button } from "./ui";

/**
 * "Sign out": forgets this family on this phone (the profile and the elder's number) and goes back
 * to the phone-number screen. Asks first in a bottom tray, so a stray tap can't sign anyone out.
 * Nothing is deleted: typing the number again and picking the profile signs back in.
 */
export default function SignOutButton() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAsking(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);

  function signOut() {
    clearSession();
    clearElder();
    router.replace("/");
  }

  return (
    <>
      <Button variant="text" className="text-danger!" onClick={() => setAsking(true)}>
        Sign out
      </Button>
      {asking && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40" onClick={() => setAsking(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-out-title"
            className="sheet-up w-full max-w-md rounded-t-[28px] bg-white px-6 pb-8 pt-3 shadow-[0_-8px_40px_rgba(31,42,41,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-sand" aria-hidden />
            <h2 id="sign-out-title" className="font-serif text-2xl font-semibold text-ink">Sign out on this phone?</h2>
            <p className="mt-2 text-lg leading-relaxed text-slate">
              Your profile and answers stay saved. To come back, type your loved one&apos;s number and pick your profile.
            </p>
            <div className="mt-6 space-y-1">
              <Button className="w-full" autoFocus onClick={signOut}>
                Sign out
              </Button>
              <Button variant="text" onClick={() => setAsking(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
