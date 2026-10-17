// "Other" opens a free-text box. The last option means "don't say" and is stored as null,
// so agents fall back to they/them (see specs/01-database/schema.md).
export const OTHER = "Other";
export const pronounOptions = (skipLabel: string) => ["She/her", "He/him", "They/them", OTHER, skipLabel];

/** Resolves a dropdown choice + free text into the value to store ("" means not given). */
export function pronounValue(choice: string, other: string, skipLabel: string) {
  if (choice === skipLabel) return "";
  return choice === OTHER ? other.trim() : choice;
}
