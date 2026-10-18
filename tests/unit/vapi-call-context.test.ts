import { describe, expect, it } from 'vitest'
import { buildCallVariables } from '@/lib/vapi/call-context'

// 03:00 UTC on Oct 18 is still the evening of Oct 17 in Toronto.
const NOW = new Date('2026-10-18T03:00:00Z')

const jane = { name: 'Jane', timezone: 'America/Toronto' }

describe('buildCallVariables', () => {
  it('fills every placeholder from the senior, family and last check-in', () => {
    const vars = buildCallVariables(
      {
        senior: jane,
        family: [
          { name: 'Sarah', relationship: 'Daughter', pronouns: 'she/her' },
          { name: 'Tom', relationship: 'Son', pronouns: null },
        ],
        lastCheckIn: { topics: ['gardening', 'her cat'] },
      },
      NOW,
    )
    expect(vars).toEqual({
      senior_name: 'Jane',
      today: 'Saturday, October 17',
      family_summary: 'Sarah (daughter, she/her); Tom (son)',
      last_topics: 'gardening, her cat',
      open_thread: 'none',
    })
  })

  it('says "none" when there is no family or previous call', () => {
    const vars = buildCallVariables({ senior: jane, family: [], lastCheckIn: null }, NOW)
    expect(vars.family_summary).toBe('none')
    expect(vars.last_topics).toBe('none')
  })

  it('treats a check-in without topics like no check-in', () => {
    const vars = buildCallVariables({ senior: jane, family: [], lastCheckIn: { topics: [' '] } }, NOW)
    expect(vars.last_topics).toBe('none')
  })

  it('never invents pronouns or a relationship', () => {
    const vars = buildCallVariables({ senior: jane, family: [{ name: 'Sam' }], lastCheckIn: null }, NOW)
    expect(vars.family_summary).toBe('Sam')
  })

  it('uses UTC when the timezone is missing or unknown', () => {
    expect(buildCallVariables({ senior: { name: 'Jane' }, family: [] }, NOW).today).toBe('Sunday, October 18')
    expect(buildCallVariables({ senior: { name: 'Jane', timezone: 'Not/AZone' }, family: [] }, NOW).today).toBe(
      'Sunday, October 18',
    )
  })
})

describe('open_thread from the last call', () => {
  it("passes on the follow-up the call summary picked", () => {
    const vars = buildCallVariables(
      { senior: jane, family: [], lastCheckIn: { topics: ['gardening'], open_thread: "Ask how Sarah's visit went" } },
      NOW,
    )
    expect(vars.open_thread).toBe("Ask how Sarah's visit went")
  })

  it.each([null, undefined, '  '])('says "none" when there is nothing to follow up (%j)', (open_thread) => {
    const vars = buildCallVariables({ senior: jane, family: [], lastCheckIn: { topics: [], open_thread } }, NOW)
    expect(vars.open_thread).toBe('none')
  })
})
