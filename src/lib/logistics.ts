// Question 6 ("How do you usually get to visit?") is answered with taps, not typing.
// The choices are stored as one readable sentence in member_profile_answers.logistics, e.g.
//   "Getting there: I drive. Distance: 15 to 30 min. Note: weekends only."
// and they also fill family_members.constraints directly, so matching never has to guess.
// This file is client-safe (no server imports).

export const TRANSPORT = [
  { label: "I drive", can_drive: true, remote: false },
  { label: "I take public transport", can_drive: false, remote: false },
  { label: "Someone drives me", can_drive: false, remote: false },
  { label: "I can only call or video", can_drive: false, remote: true },
] as const;

// travel_minutes is an upper bound for the choice; 90 means "more than an hour".
export const DISTANCE = [
  { label: "Under 15 min", minutes: 15 },
  { label: "15 to 30 min", minutes: 30 },
  { label: "30 to 60 min", minutes: 60 },
  { label: "Over an hour", minutes: 90 },
] as const;

export type Logistics = { transport: string; distance: string; note: string };
export type Constraints = { can_drive: boolean | null; travel_minutes: number | null; notes: string | null };

const transportByLabel = (l: string) => TRANSPORT.find((t) => t.label === l);
const distanceByLabel = (l: string) => DISTANCE.find((d) => d.label === l);

/** The stored sentence. The note keeps its spaces so typing in a controlled box feels normal. */
export function composeLogistics({ transport, distance, note }: Logistics): string {
  const parts: string[] = [];
  if (transport) parts.push(`Getting there: ${transport}.`);
  if (distance && !transportByLabel(transport)?.remote) parts.push(`Distance: ${distance}.`);
  if (note.trim()) parts.push(`Note: ${note}`);
  return parts.join(" ");
}

/**
 * Reads a sentence made by composeLogistics. Returns null for anything else (for example an
 * older free-text answer), so callers can treat that as a plain note.
 */
export function parseLogistics(text: string): Logistics | null {
  if (!text.trim()) return { transport: "", distance: "", note: "" };
  // The note runs to the end; what comes before it is the two choices. Choice labels never
  // contain a period, so the period after each one is optional when reading.
  const noteAt = text.search(/(^|\s)Note: /);
  const head = (noteAt === -1 ? text : text.slice(0, noteAt)).trim();
  const note = noteAt === -1 ? "" : text.slice(noteAt).replace(/^\s*Note: /, "");
  const m = /^(?:Getting there: ([^.]+?)\.?)?(?:\s*Distance: ([^.]+?)\.?)?$/.exec(head);
  if (!m) return null;
  const [, transport = "", distance = ""] = m;
  if (transport && !transportByLabel(transport)) return null;
  if (distance && !distanceByLabel(distance)) return null;
  return { transport, distance, note };
}

export function logisticsConstraints({ transport, distance, note }: Logistics): Constraints {
  const t = transportByLabel(transport);
  const remote = !!t?.remote;
  const trimmed = note.trim();
  const notes = [remote ? "Can only call or video" : "", trimmed].filter(Boolean).join(". ") || null;
  return {
    can_drive: t ? t.can_drive : null,
    travel_minutes: remote ? null : (distanceByLabel(distance)?.minutes ?? null),
    notes,
  };
}
