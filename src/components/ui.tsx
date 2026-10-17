import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const inputCls =
  "w-full h-14 rounded-2xl border border-sand bg-white px-4 text-lg text-ink outline-none placeholder:text-slate/50 focus:border-primary focus:ring-2 focus:ring-primary/20";
export const textareaCls =
  "w-full rounded-2xl border border-sand bg-white px-4 py-3 text-lg text-ink outline-none placeholder:text-slate/50 focus:border-primary focus:ring-2 focus:ring-primary/20";
export const labelCls = "mb-2 block text-sm font-semibold text-ink";
export const headingCls = "font-serif text-[32px] font-semibold leading-tight text-ink";
export const subCls = "mt-3 text-lg leading-relaxed text-slate";

export function Logo() {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-mist">
        <svg viewBox="0 0 32 32" className="h-7 w-7 text-primary" fill="none" aria-hidden>
          <path d="M16 5c-6 0-11 4-11 9.5 0 3 1.5 5.5 4 7.2L8 27l5.2-3.3c.9.2 1.8.3 2.8.3 6 0 11-4 11-9.5S22 5 16 5Z" fill="currentColor" />
          <path d="M11.5 14.5c1.2 2 3 3 4.5 3s3.3-1 4.5-3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
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
    primary: "bg-primary text-white hover:bg-primary-dark disabled:bg-primary/40",
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
        <div className={`flex-1 px-6 pt-6 ${tabs ? "pb-28" : "pb-6"}`}>{children}</div>
        {footer && <div className="sticky bottom-0 border-t border-sand bg-white px-6 py-4 sm:rounded-b-[28px]">{footer}</div>}
        {tabs}
      </div>
    </div>
  );
}

const icons = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z",
  calendar: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4 3.6-6 8-6s8 2 8 6",
};

export function TabBar({ active, name }: { active: "home" | "availability" | "profile"; name: string }) {
  const tabs = [
    { key: "home", href: "/dashboard", label: "Home", icon: icons.home },
    { key: "availability", href: "/availability", label: "Availability", icon: icons.calendar },
    { key: "profile", href: "/profile", label: name || "Me", icon: icons.person },
  ] as const;
  return (
    <nav className="fixed bottom-0 left-1/2 z-10 flex w-full max-w-md -translate-x-1/2 border-t border-sand bg-white pb-[env(safe-area-inset-bottom)] sm:absolute sm:rounded-b-[28px]">
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
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
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
  id, value, onChange, options, placeholder,
}: { id: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <div className="relative">
      <select
        id={id}
        className={`${inputCls} appearance-none pr-12 ${value ? "" : "text-slate/60"}`}
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
