// Mood faces for check_ins.mood_score (-1 very low … 1 very happy). Five faces plus "unknown" for a
// call with no score yet, each with its own colour. Every face is drawn on a 24×24 grid with its
// features centred on (12, 12), so it sits in the middle of its circle.

export type MoodLevel = "great" | "good" | "okay" | "low" | "veryLow" | "unknown";

export function moodLevel(score: number | null | undefined): MoodLevel {
  if (score == null || Number.isNaN(score)) return "unknown";
  if (score >= 0.6) return "great";
  if (score >= 0.2) return "good";
  if (score > -0.2) return "okay";
  if (score > -0.6) return "low";
  return "veryLow";
}

/** Colour of each face: `fg` draws the face, `bg` fills its circle. CSS colours, so SVG can use them too. */
export const MOOD_COLORS: Record<MoodLevel, { fg: string; bg: string; label: string }> = {
  great: { fg: "var(--color-good)", bg: "#e3f1e8", label: "Very happy" },
  good: { fg: "var(--color-good)", bg: "#eef6f1", label: "Happy" },
  okay: { fg: "var(--color-primary)", bg: "var(--color-mist)", label: "Okay" },
  low: { fg: "var(--color-warn)", bg: "var(--color-warn-bg)", label: "A bit low" },
  veryLow: { fg: "var(--color-danger)", bg: "var(--color-danger-bg)", label: "Very low" },
  unknown: { fg: "var(--color-slate)", bg: "var(--color-cream)", label: "Mood unknown" },
};

const EYES = (
  <>
    <circle cx="8.6" cy="9.4" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="15.4" cy="9.4" r="1.25" fill="currentColor" stroke="none" />
  </>
);

/** The face's eyes and mouth only, for use inside any <svg viewBox="0 0 24 24"> or a scaled <g>. */
export function MoodGlyph({ level }: { level: MoodLevel }) {
  switch (level) {
    case "great": // smiling eyes, open smile
      return (
        <>
          <path d="M7 10c.6-1.3 2.6-1.3 3.2 0M13.8 10c.6-1.3 2.6-1.3 3.2 0" />
          <path d="M7.6 13.2h8.8a4.4 4.4 0 0 1-8.8 0Z" fill="currentColor" stroke="none" />
        </>
      );
    case "good":
      return (
        <>
          {EYES}
          <path d="M8 14c2.1 2.4 5.9 2.4 8 0" />
        </>
      );
    case "okay":
      return (
        <>
          {EYES}
          <path d="M8.6 15h6.8" />
        </>
      );
    case "low":
      return (
        <>
          {EYES}
          <path d="M8.2 16.2c2-1.9 5.6-1.9 7.6 0" />
        </>
      );
    case "veryLow": // worried brows, deeper frown
      return (
        <>
          {/* Inner ends raised: worried, not angry. */}
          <path d="M6.6 7l3-.9M17.4 7l-3-.9" />
          {EYES}
          <path d="M8 16.8c2.1-2.6 5.9-2.6 8 0" />
        </>
      );
    default: // unknown: a face with a dotted mouth, so it never reads as a real mood
      return (
        <>
          {EYES}
          <path d="M8.8 15h.01M12 15h.01M15.2 15h.01" strokeWidth="2.2" />
        </>
      );
  }
}

/** The round mood face shown next to "Mood today" and on a call's page. */
export function MoodFace({ score, size = 64 }: { score: number | null; size?: number }) {
  const level = moodLevel(score);
  const c = MOOD_COLORS[level];
  return (
    <span
      role="img"
      aria-label={c.label}
      style={{ width: size, height: size, color: c.fg, background: c.bg, borderColor: `color-mix(in srgb, ${c.fg} 22%, transparent)` }}
      className="grid shrink-0 place-items-center rounded-full border-2"
    >
      <svg viewBox="0 0 24 24" style={{ width: size * 0.62, height: size * 0.62 }} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <MoodGlyph level={level} />
      </svg>
    </span>
  );
}
