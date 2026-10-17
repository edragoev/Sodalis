"use client";

import { useNotifications } from "@/lib/hooks/useNotifications";
import { primaryCls } from "./ui";

// The one place a person is asked to turn notifications on, from a button press (never on page load).
export default function NotificationsButton({ memberId }: { memberId: string | null }) {
  const { permission, error, isReady, enable } = useNotifications({ memberId });

  // Nothing until the browser has been checked, and nothing if it can't do notifications or
  // nobody is linked (a token needs a member to belong to).
  if (!isReady || permission === "unsupported" || !memberId) return null;

  return (
    <div className="space-y-2">
      {permission === "default" && (
        <button type="button" className={primaryCls} onClick={() => void enable()}>
          Turn on notifications
        </button>
      )}
      {permission === "granted" && <p className="text-stone-700">Notifications are on.</p>}
      {permission === "denied" && (
        <p className="text-stone-700">
          Notifications are blocked. To turn them on, change this site&apos;s setting in your browser settings.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-800">Couldn&apos;t turn on notifications. Please try again.</p>
      )}
    </div>
  );
}
