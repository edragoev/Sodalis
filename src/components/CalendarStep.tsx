"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/session";
import { normalizeGoogleCalendarEmbedUrl, PublicCalendarEmbed } from "./PublicCalendarEmbed";
import { Button, Screen, headingCls, inputCls, subCls } from "./ui";

const DEFAULT_PUBLIC_CALENDAR = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_URL || "";

export default function CalendarStep() {
  const router = useRouter();
  const [publicCalendarUrl, setPublicCalendarUrl] = useState(DEFAULT_PUBLIC_CALENDAR);
  const [calendarEmbedUrl, setCalendarEmbedUrl] = useState(DEFAULT_PUBLIC_CALENDAR);

  useEffect(() => {
    if (!getSession()) router.replace("/");
  }, [router]);

  const handleConnect = () => {
    const session = getSession();
    if (!session) {
      router.replace("/");
      return;
    }
    window.location.assign(`/api/auth/google?member_id=${encodeURIComponent(session.member_id)}`);
  };

  const handlePreviewPublicCalendar = () => {
    const trimmed = publicCalendarUrl.trim();
    if (!trimmed) return;
    setCalendarEmbedUrl(normalizeGoogleCalendarEmbedUrl(trimmed));
  };

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

      <div className="mt-8 space-y-3">
        <Button className="w-full" onClick={handleConnect}>
          Connect private Google Calendar
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => router.push("/availability")}>
          Continue without Google
        </Button>
      </div>

      <div className="mt-6 rounded-2xl border border-sand bg-cream p-4">
        <label htmlFor="public-google-calendar" className="mb-2 block text-sm font-semibold text-ink">
          Public Google Calendar URL
        </label>
        <input
          id="public-google-calendar"
          type="url"
          value={publicCalendarUrl}
          onChange={(event) => setPublicCalendarUrl(event.target.value)}
          placeholder="https://calendar.google.com/calendar/embed?..."
          className={`${inputCls} h-12 text-base`}
        />
        <Button variant="secondary" className="mt-3 w-full" onClick={handlePreviewPublicCalendar}>
          Preview public calendar
        </Button>
        <p className="mt-2 text-xs text-slate">This option does not require a Google sign-in and works for public calendars only.</p>
      </div>

      {calendarEmbedUrl && <PublicCalendarEmbed url={calendarEmbedUrl} />}

      <p className="mt-4 text-center text-sm text-slate">We use a read-only free/busy check and nothing more for private calendars.</p>
    </Screen>
  );
}
