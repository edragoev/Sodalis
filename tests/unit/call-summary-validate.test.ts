import { describe, expect, it } from 'vitest'
import { parseCallSummary } from '@/lib/call-summary/validate'

// Gemini's call summary is checked before it is saved: small problems are fixed, broken answers refused.

const good = {
  mood_score: 0.6,
  mood_label: 'Cheerful',
  topics: ['Gardening', "sarah's visit"],
  engagement_score: 0.8,
  summary: 'Jane talked about her zucchini and mentioned a sore knee.',
  open_thread: "Ask how Sarah's visit on Saturday went",
}

const parse = (over: Record<string, unknown> = {}) => parseCallSummary({ ...good, ...over })

describe('parseCallSummary', () => {
  it('keeps a good answer, with the label and topics in lowercase', () => {
    expect(parse()).toEqual({
      ok: true,
      summary: {
        mood_score: 0.6,
        mood_label: 'cheerful',
        topics: ['gardening', "sarah's visit"],
        engagement_score: 0.8,
        summary: 'Jane talked about her zucchini and mentioned a sore knee.',
        open_thread: "Ask how Sarah's visit on Saturday went",
      },
    })
  })

  it('clamps scores into range and rounds them', () => {
    const result = parse({ mood_score: 1.3, engagement_score: -0.2 })
    expect(result.ok && result.summary.mood_score).toBe(1)
    expect(result.ok && result.summary.engagement_score).toBe(0)
    const rounded = parse({ mood_score: -0.33333 })
    expect(rounded.ok && rounded.summary.mood_score).toBe(-0.33)
  })

  it('keeps "hard to tell" calls without a score', () => {
    const result = parse({ mood_score: null, mood_label: 'hard to tell' })
    expect(result.ok && result.summary).toMatchObject({ mood_score: null, mood_label: 'hard to tell' })
  })

  it('cleans topics: trims, drops blanks and duplicates, keeps at most 5', () => {
    const result = parse({ topics: [' Garden ', 'garden', '', 7, 'tea', 'cat', 'church', 'bingo', 'weather'] })
    expect(result.ok && result.summary.topics).toEqual(['garden', 'tea', 'cat', 'church', 'bingo'])
  })

  it('caps long text', () => {
    const result = parse({ summary: 'a'.repeat(1000), topics: ['b'.repeat(100)] })
    expect(result.ok && result.summary.summary).toHaveLength(600)
    expect(result.ok && result.summary.topics[0]).toHaveLength(40)
  })

  it.each([null, '', '   '])('treats an empty open_thread (%j) as nothing to follow up', (open_thread) => {
    const result = parse({ open_thread })
    expect(result.ok && result.summary.open_thread).toBeNull()
  })

  it('treats a missing topics list as no topics', () => {
    const result = parse({ topics: undefined })
    expect(result.ok && result.summary.topics).toEqual([])
  })

  it.each([
    ['not an object', 'just text'],
    ['summary is missing', { ...good, summary: '  ' }],
    ['mood_label is missing', { ...good, mood_label: undefined }],
    ['engagement_score is not a number', { ...good, engagement_score: 'high' }],
    ['mood_score is not a number', { ...good, mood_score: 'happy' }],
    ['mood_score is not a number', { ...good, mood_score: undefined }],
  ])('refuses an answer when %s', (reason, raw) => {
    expect(parseCallSummary(raw)).toEqual({ ok: false, reason })
  })
})
