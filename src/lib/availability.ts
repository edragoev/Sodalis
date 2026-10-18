// A weekly window, "{ dow, start, end }" (dow 0 = Sunday, 24 h local times). The scheduler's free hours
// (src/lib/scheduler/slots.ts FREE_HOURS) use this shape; so do the unused seniors.preferred_windows and
// family_members.manual_availability columns.
export type Window = { dow: number; start: string; end: string };
