import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless invite tokens: "<senior id without dashes>.<signature>". The signature is an
// HMAC keyed with a server-only secret, so a link can't be guessed or forged and nothing
// needs to be stored. (Trade-off: a link can't be revoked individually.)
function sign(seniorHex: string) {
  const secret = process.env.INVITE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No secret available to sign invites");
  return createHmac("sha256", secret).update(seniorHex).digest("base64url").slice(0, 22);
}

export function makeInviteToken(seniorId: string) {
  const hex = seniorId.replace(/-/g, "");
  return `${hex}.${sign(hex)}`;
}

/** Returns the senior id for a valid token, otherwise null. */
export function parseInviteToken(token: string): string | null {
  const [hex, sig] = String(token).split(".");
  if (!hex || !sig || !/^[0-9a-f]{32}$/i.test(hex)) return null;
  const expected = Buffer.from(sign(hex.toLowerCase()));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
