"use client";

import { useState } from "react";
import { Button } from "./ui";

// "Invite family" card: shares (or copies) a signed link that skips the phone-number step.
export default function InviteCard({ memberId, seniorName }: { memberId: string; seniorName: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function invite() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/link/invite?member_id=${encodeURIComponent(memberId)}`);
      const { token } = await res.json();
      if (!res.ok || !token) throw new Error();
      const url = `${window.location.origin}/join/${token}`;
      const text = `Join ${seniorName}'s circle on Sodalis`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "Sodalis", text, url });
          return setNote("Invite shared.");
        } catch (e) {
          if ((e as Error).name === "AbortError") return; // user closed the share sheet
        }
      }
      await navigator.clipboard.writeText(url);
      setNote("Link copied. Send it to a family member.");
    } catch {
      setNote("Couldn't create the link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl bg-mist p-5">
      <h2 className="font-serif text-xl font-semibold text-ink">Invite family</h2>
      <p className="mt-1 text-slate">Send a link so relatives can join {seniorName}&apos;s circle. They only need their name.</p>
      <Button variant="secondary" className="mt-4 h-12 w-full text-base" disabled={busy} onClick={invite}>
        {busy ? "Creating link…" : "Share invite link"}
      </Button>
      {note && (
        <p role="status" className="mt-3 text-sm text-primary-dark">
          {note}
        </p>
      )}
    </section>
  );
}
