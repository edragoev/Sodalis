// Shapes and helpers for opportunities (specs/06-notifications/conversation-to-visit.md).
// `proposed_slots` has no spec'd shape yet, so this reads it tolerantly. The shape we ask
// the coordinator to write is:
//   [{ "id": "s1", "starts_at": ISO, "ends_at": ISO, "kind": "visit"|"call", "member_id": uuid|null }]
// ends_at, kind and member_id are optional. A slot with a member_id is only for that member.
export type Slot = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  kind: "visit" | "call" | null;
  member_id: string | null;
};

export type OpportunityType = "gift_errand" | "activity" | "event" | "wants_contact";
export type OpportunityStatus = "detected" | "proposed" | "confirmed" | "declined" | "expired";

export function normalizeSlots(raw: unknown): Slot[] {
  if (!Array.isArray(raw)) return [];
  const slots: Slot[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const s = item as Record<string, unknown>;
    const start = String(s.starts_at ?? s.start ?? "");
    if (!start || Number.isNaN(Date.parse(start))) return;
    const end = String(s.ends_at ?? s.end ?? "");
    slots.push({
      id: String(s.id ?? `slot-${i}`),
      starts_at: new Date(start).toISOString(),
      ends_at: end && !Number.isNaN(Date.parse(end)) ? new Date(end).toISOString() : null,
      kind: s.kind === "visit" || s.kind === "call" ? s.kind : null,
      member_id: typeof s.member_id === "string" ? s.member_id : null,
    });
  });
  return slots.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** End time for a slot that doesn't carry one: 2 h for a visit, 30 min for a call. */
export function slotEnd(slot: Slot, fallbackKind: "visit" | "call"): string {
  if (slot.ends_at) return slot.ends_at;
  const minutes = (slot.kind ?? fallbackKind) === "call" ? 30 : 120;
  return new Date(Date.parse(slot.starts_at) + minutes * 60_000).toISOString();
}

export function opportunityTitle(type: OpportunityType, item: string | null, elder: string): string {
  switch (type) {
    case "gift_errand":
      return item ? `A visit idea: ${item}` : "A visit idea";
    case "activity":
      return "Something to do together";
    case "event":
      return "A moment to be there";
    case "wants_contact":
      return `${elder} would love to hear from you`;
  }
}
