import { describe, expect, it } from 'vitest'
import { MAX_COOLDOWN_MS, QUOTA_COOLDOWN_MS, SHORT_COOLDOWN_MS, backoffFor } from '@/lib/gemini-backoff'

// After Gemini refuses, how long the app stops asking. The free tier says how long it wants us to wait.

const quotaError = (message: string, status = 429) => Object.assign(new Error(message), { status })
const MIN = 60_000

describe('backoffFor', () => {
  it('waits only a minute after an ordinary failure', () => {
    expect(backoffFor(new Error('socket hang up'))).toEqual({ waitMs: SHORT_COOLDOWN_MS, quota: false })
    expect(backoffFor('boom')).toEqual({ waitMs: SHORT_COOLDOWN_MS, quota: false })
    expect(backoffFor(null)).toEqual({ waitMs: SHORT_COOLDOWN_MS, quota: false })
  })

  it('treats a 429 as a quota and honours the delay Google gives (seconds)', () => {
    const e = quotaError('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"2160s"}]}}')
    expect(backoffFor(e)).toEqual({ waitMs: 36 * MIN, quota: true })
  })

  it('reads a human delay like "retry in 36m"', () => {
    expect(backoffFor(quotaError('You exceeded your current quota. Please retry in 36m.'))).toEqual({ waitMs: 36 * MIN, quota: true })
    expect(backoffFor(quotaError('Please retry in 25m 30s')).waitMs).toBe(25.5 * MIN)
    expect(backoffFor(quotaError('Please retry in 1h')).waitMs).toBe(60 * MIN)
    expect(backoffFor(quotaError('Please retry in 45.5s')).waitMs).toBe(SHORT_COOLDOWN_MS) // never less than a minute
  })

  it('assumes ten minutes when it is a quota but no delay is given', () => {
    expect(backoffFor(quotaError('You exceeded your current quota'))).toEqual({ waitMs: QUOTA_COOLDOWN_MS, quota: true })
  })

  it('recognises a quota from the text even without a status', () => {
    expect(backoffFor(new Error('RESOURCE_EXHAUSTED: try later')).quota).toBe(true)
  })

  it('never waits more than an hour, so a bad number cannot lock the feature for a day', () => {
    expect(backoffFor(quotaError('{"retryDelay":"864000s"}')).waitMs).toBe(MAX_COOLDOWN_MS)
  })

  it('a 500 or other status is not a quota', () => {
    expect(backoffFor(quotaError('internal error', 500)).quota).toBe(false)
  })
})
