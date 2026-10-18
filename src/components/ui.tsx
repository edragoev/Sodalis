import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const inputBaseCls =
  "w-full h-14 rounded-2xl border border-sand bg-white px-4 text-ink outline-none placeholder:text-slate/50 focus:border-primary focus:ring-2 focus:ring-primary/20";
export const inputCls = `${inputBaseCls} text-lg`;
export const largeInputCls = `${inputBaseCls} text-xl`;
export const textareaCls =
  "w-full rounded-2xl border border-sand bg-white px-4 py-3 text-lg text-ink outline-none placeholder:text-slate/50 focus:border-primary focus:ring-2 focus:ring-primary/20";
const labelBaseCls = "mb-2 block font-semibold text-ink";
// Class-string version of <Button> for plain <button>/<a> elements.
export const primaryCls =
  "h-14 w-full rounded-2xl bg-btn px-6 text-lg font-semibold text-primary-dark transition-colors hover:bg-btn-hover disabled:opacity-50";
export const labelCls = `${labelBaseCls} text-sm`;
export const largeLabelCls = `${labelBaseCls} text-2xl`;
export const headingCls = "font-serif text-[32px] font-semibold leading-tight text-ink";
export const subCls = "mt-3 text-lg leading-relaxed text-slate";

// A tilted phone handset with two dot eyes above it: Sodalis's friendly voice on the line.
const HANDSET =
  "M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z";

export function Logo({ align = "center" }: { align?: "center" | "left" | "right" }) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "justify-end" : align === "left" ? "justify-start" : "justify-center"}`}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-btn">
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-primary-dark" fill="currentColor" aria-hidden>
          <path d={HANDSET} />
          <circle cx="13.2" cy="5.6" r="1.5" />
          <circle cx="18.2" cy="9.6" r="1.5" />
        </svg>
      </span>
      <span className="font-serif text-3xl font-semibold text-ink">Sodalis</span>
    </div>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Back" className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-mist">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "text" };
export function Button({ variant = "primary", className = "", ...props }: BtnProps) {
  const styles = {
    primary: "bg-btn text-primary-dark hover:bg-btn-hover disabled:opacity-50",
    secondary: "border border-sand bg-white text-ink hover:bg-cream disabled:opacity-50",
    text: "text-ink underline-offset-4 hover:underline disabled:opacity-50",
  }[variant];
  return (
    <button
      {...props}
      className={`h-14 rounded-2xl px-6 text-lg font-semibold transition-colors ${variant === "text" ? "w-full" : ""} ${styles} ${className}`}
    />
  );
}

/** Centered mobile-width card with an optional pinned footer. */
export function Screen({
  top,
  footer,
  children,
  tabs,
}: {
  top?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh justify-center bg-cream sm:items-center sm:p-6">
      <div className="relative flex min-h-dvh w-full max-w-md flex-col bg-white sm:min-h-[680px] sm:rounded-[28px] sm:shadow-[0_8px_40px_rgba(31,42,41,0.08)]">
        {top && <div className="px-6 pt-5">{top}</div>}
        <div className="flex-1 px-6 pb-6 pt-6">{children}</div>
        {(footer || tabs) && (
          // The footer and the tab bar share one sticky area, so they stack and can never overlap.
          <div className="sticky bottom-0 z-10 bg-white sm:rounded-b-[28px]">
            {footer && <div className="border-t border-sand px-6 py-4">{footer}</div>}
            {tabs}
          </div>
        )}
      </div>
    </div>
  );
}

const icons = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z",
  calendar: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4 3.6-6 8-6s8 2 8 6",
};

export function TabBar({ active, name }: { active: "home" | "calendar" | "profile"; name: string }) {
  const tabs = [
    { key: "home", href: "/dashboard", label: "Home", icon: icons.home },
    { key: "calendar", href: "/schedule", label: "Calendar", icon: icons.calendar },
    { key: "profile", href: "/profile", label: name || "Me", icon: icons.person },
  ] as const;
  return (
    <nav className="flex w-full border-t border-sand bg-white pb-[env(safe-area-inset-bottom)] sm:rounded-b-[28px]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-semibold ${active === t.key ? "text-primary" : "text-slate"}`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={t.icon} />
          </svg>
          <span className="max-w-24 truncate">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  // Always the first name's initial, so "Anna Smith" and "Anna" look the same.
  const initials = name.trim().charAt(0).toUpperCase();
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="grid shrink-0 place-items-center rounded-full bg-mist font-serif font-semibold text-primary-dark"
    >
      {initials || "?"}
    </span>
  );
}

export function SelectField({
  id, value, onChange, options, placeholder, large = false, blackText = false,
}: { id: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string; large?: boolean; blackText?: boolean }) {
  return (
    <div className="relative">
      <select
        id={id}
        className={`${large ? largeInputCls : inputCls} appearance-none pr-12 ${!value && !blackText ? "text-slate/60" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

export function MoodFace({ score }: { score: number | null }) {
  const mouth = score == null || (score > -0.35 && score <= 0.35) ? "M9 20h10" : score > 0.35 ? "M8 18c2 3 8 3 10 0" : "M8 21c2-3 8-3 10 0";
  return (
    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-primary/20 bg-mist text-primary">
      <svg viewBox="0 0 26 26" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="9" cy="11" r=".8" fill="currentColor" />
        <circle cx="17" cy="11" r=".8" fill="currentColor" />
        <path d={mouth} transform={score != null && score > 0.35 ? "" : "translate(0 -3)"} />
      </svg>
    </span>
  );
}
