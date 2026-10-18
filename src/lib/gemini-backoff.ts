// How long to stop asking Gemini after it refuses. On the free tier a refusal usually means a quota
// ("You exceeded your current quota ... retry in 36m"), and asking again before that only wastes
// requests. Pure, so it can be tested without a network.

const MINUTE = 60_000
export const SHORT_COOLDOWN_MS = MINUTE // an ordinary failure: try again after a minute
export const QUOTA_COOLDOWN_MS = 10 * MINUTE // rate limited, and Google did not say for how long
export const MAX_COOLDOWN_MS = 60 * MINUTE

export type Backoff = { waitMs: number; quota: boolean }

/** Seconds from "retryDelay": "2160s" or "Please retry in 36m", whichever the error carries. */
function retryDelaySeconds(text: string): number | null {
  const exact = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text)
  if (exact) return Number(exact[1])
  const human = /retry in\s+(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i.exec(text)
  if (human && (human[1] || human[2] || human[3])) {
    return Number(human[1] ?? 0) * 3600 + Number(human[2] ?? 0) * 60 + Number(human[3] ?? 0)
  }
  return null
}

export function backoffFor(error: unknown): Backoff {
  const text = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: unknown } | null)?.status
  const quota = status === 429 || /RESOURCE_EXHAUSTED|exceeded your current quota/i.test(text)
  if (!quota) return { waitMs: SHORT_COOLDOWN_MS, quota: false }
  const seconds = retryDelaySeconds(text)
  const waitMs = seconds === null ? QUOTA_COOLDOWN_MS : Math.min(Math.max(seconds * 1000, SHORT_COOLDOWN_MS), MAX_COOLDOWN_MS)
  return { waitMs, quota: true }
}

// A slow or failing Gemini (a timeout, "503 overloaded", "504 DEADLINE_EXCEEDED") often works a moment later,
// so each post-call agent asks once more. A quota refusal is never retried: that only wastes a request.
const TRANSIENT = /DEADLINE_EXCEEDED|UNAVAILABLE|overloaded|INTERNAL|timed? ?out|timeout|abort/i

/** Whether a failed Gemini call is worth one more try: a timeout or a Google-side error, never a quota refusal. */
export function isTransient(error: unknown): boolean {
  if (backoffFor(error).quota) return false
  const status = (error as { status?: unknown } | null)?.status
  if (typeof status === 'number') return status >= 500
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return TRANSIENT.test(text) || /"code"\s*:\s*5\d\d/.test(text)
}

/** Runs `ask`, and once more if it fails in a way that is worth retrying. */
export async function withOneRetry<T>(ask: () => Promise<T>): Promise<T> {
  try {
    return await ask()
  } catch (err) {
    if (!isTransient(err)) throw err
    return ask()
  }
}
