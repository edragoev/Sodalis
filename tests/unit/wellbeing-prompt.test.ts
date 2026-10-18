import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT } from '@/lib/wellbeing/prompt'

// The follow-up must repeat what the elder asked for, never a clinical or invented suggestion.

describe('wellbeing system prompt', () => {
  it('asks for the elder\'s own words as the follow-up, else Unknown', () => {
    expect(SYSTEM_PROMPT).toContain('Repeat exactly what the grandparent said they want or need')
    expect(SYSTEM_PROMPT).toContain('"Unknown"')
    expect(SYSTEM_PROMPT).toContain('The elder wishes someone would come over.')
  })

  it('forbids clinical advice, invented tasks and choosing a family member', () => {
    expect(SYSTEM_PROMPT).toContain('Do not generate your own clinical follow-up advice')
    expect(SYSTEM_PROMPT).toContain('Do not choose a particular family member')
    expect(SYSTEM_PROMPT).not.toContain('a family member could call or arrange a visit')
    expect(SYSTEM_PROMPT).not.toContain('proportionate suggestion')
  })
})
