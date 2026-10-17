import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Normalize free-form input to E.164, or null if invalid / not a plausible mobile. */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const region = (process.env.DEFAULT_PHONE_REGION || "US") as CountryCode;
  const p = parsePhoneNumberFromString(input.trim(), region);
  if (!p || !p.isValid()) return null;
  const type = p.getType();
  if (type && type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") return null;
  return p.number;
}
