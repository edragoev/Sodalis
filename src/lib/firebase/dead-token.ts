// FCM error codes meaning the token will never work again. Anything else (for example
// internal-error) is transient, and the token should be kept.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/** True for an error (or a per-token FCM error) saying the token is dead. */
export function isDeadTokenError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && DEAD_TOKEN_CODES.has(code)
}
