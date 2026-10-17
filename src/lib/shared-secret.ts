import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Whether the secret a caller sent matches the configured one. Compares digests so the check takes the
 * same time wherever the strings differ. With no secret configured nothing matches, so a missing
 * setting refuses everyone instead of letting everyone in.
 */
export function secretMatches(expected: string | undefined, given: string | null): boolean {
  if (!expected || !given) return false
  const digest = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(digest(expected), digest(given))
}
