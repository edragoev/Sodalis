import { describe, expect, it, vi } from 'vitest'
import { MAX_COOLDOWN_MS, QUOTA_COOLDOWN_MS, SHORT_COOLDOWN_MS, backoffFor, geminiModels, withFallback, withOneRetry } from '@/lib/gemini-backoff'

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

describe('withOneRetry: one more try for a slow or failing Gemini, never for a quota refusal', () => {
  const fails = (err: unknown) => vi.fn().mockRejectedValueOnce(err).mockResolvedValue('answer')

  it.each([
    ['a 504 DEADLINE_EXCEEDED', new Error('{"error":{"code":504,"message":"Deadline expired before operation could complete.","status":"DEADLINE_EXCEEDED"}}')],
    ['a 503 overloaded', Object.assign(new Error('The model is overloaded'), { status: 503 })],
    ['a timeout', Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })],
  ])('asks again after %s', async (_, err) => {
    const ask = fails(err)
    await expect(withOneRetry(ask)).resolves.toBe('answer')
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a quota refusal', Object.assign(new Error('RESOURCE_EXHAUSTED: You exceeded your current quota'), { status: 429 })],
    ['a bad request', Object.assign(new Error('Invalid schema'), { status: 400 })],
  ])('does not ask again after %s', async (_, err) => {
    const ask = fails(err)
    await expect(withOneRetry(ask)).rejects.toBe(err)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('gives up after the second failure', async () => {
    const err = Object.assign(new Error('overloaded'), { status: 503 })
    const ask = vi.fn().mockRejectedValue(err)
    await expect(withOneRetry(ask)).rejects.toBe(err)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('asks only once when the first answer comes back', async () => {
    const ask = vi.fn().mockResolvedValue('answer')
    await withOneRetry(ask)
    expect(ask).toHaveBeenCalledTimes(1)
  })
})

describe('withFallback: a second model when the first is overloaded', () => {
  const overloaded = Object.assign(new Error('This model is currently experiencing high demand'), { status: 503 })
  const quota = Object.assign(new Error('RESOURCE_EXHAUSTED: You exceeded your current quota'), { status: 429 })
  const answerFrom = (busy: string, err: unknown) => vi.fn(async (model: string) => {
    if (model === busy) throw err
    return `answer from ${model}`
  })

  it('asks the fallback model once after the main model fails twice', async () => {
    const ask = answerFrom('main', overloaded)
    await expect(withFallback('main', 'backup', ask)).resolves.toBe('answer from backup')
    expect(ask.mock.calls.map(([m]) => m)).toEqual(['main', 'main', 'backup'])
  })

  it('never asks the fallback when the main model answers', async () => {
    const ask = vi.fn().mockResolvedValue('answer')
    await withFallback('main', 'backup', ask)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledWith('main')
  })

  it.each([
    ['a quota refusal', quota],
    ['a bad request', Object.assign(new Error('Invalid schema'), { status: 400 })],
  ])('does not send %s to the fallback', async (_, err) => {
    const ask = answerFrom('main', err)
    await expect(withFallback('main', 'backup', ask)).rejects.toBe(err)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('without a fallback, fails as before after two tries', async () => {
    const ask = answerFrom('main', overloaded)
    await expect(withFallback('main', undefined, ask)).rejects.toBe(overloaded)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('gives up when the fallback fails too', async () => {
    const ask = vi.fn().mockRejectedValue(overloaded)
    await expect(withFallback('main', 'backup', ask)).rejects.toBe(overloaded)
    expect(ask).toHaveBeenCalledTimes(3)
  })
})

describe('geminiModels', () => {
  it('reads the main and fallback model', () => {
    expect(geminiModels({ GEMINI_MODEL: 'a', GEMINI_FALLBACK_MODEL: 'b' } as NodeJS.ProcessEnv)).toEqual({ model: 'a', fallback: 'b' })
  })

  it.each([
    ['unset', { GEMINI_MODEL: 'a' }],
    ['empty', { GEMINI_MODEL: 'a', GEMINI_FALLBACK_MODEL: '' }],
    ['the same as the main model', { GEMINI_MODEL: 'a', GEMINI_FALLBACK_MODEL: 'a' }],
  ])('has no fallback when it is %s', (_, env) => {
    expect(geminiModels(env as NodeJS.ProcessEnv).fallback).toBeUndefined()
  })
})
