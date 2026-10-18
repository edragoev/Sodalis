import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { ImportError, detectType, parseIcs, parseUpload } from '@/lib/calendar/import'
import { expandEvents } from '@/lib/calendar/expand'

const TORONTO = 'America/Toronto'
const cal = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events, 'END:VCALENDAR'].join('\r\n')
const event = (...lines: string[]) => ['BEGIN:VEVENT', 'UID:u1@test', 'SUMMARY:Lunch', ...lines, 'END:VEVENT'].join('\r\n')

describe('parseIcs: UTC normalization', () => {
  it('converts a TZID time to UTC', () => {
    const { rows } = parseIcs(cal(event('DTSTART;TZID=America/Toronto:20261019T140000', 'DTEND;TZID=America/Toronto:20261019T150000')), 'UTC')
    expect(rows[0].starts_at).toBe('2026-10-19T18:00:00.000Z') // EDT, UTC-4
    expect(rows[0].ends_at).toBe('2026-10-19T19:00:00.000Z')
    expect(rows[0].source_tz).toBe(TORONTO)
  })

  it('keeps a Z time as is', () => {
    const { rows } = parseIcs(cal(event('DTSTART:20261019T140000Z', 'DTEND:20261019T150000Z')), TORONTO)
    expect(rows[0].starts_at).toBe('2026-10-19T14:00:00.000Z')
  })

  it('reads a floating time in the fallback zone', () => {
    const { rows } = parseIcs(cal(event('DTSTART:20261019T140000', 'DTEND:20261019T150000')), TORONTO)
    expect(rows[0].starts_at).toBe('2026-10-19T18:00:00.000Z')
  })

  it('uses winter offsets after DST ends', () => {
    const { rows } = parseIcs(cal(event('DTSTART;TZID=America/Toronto:20261110T140000', 'DTEND;TZID=America/Toronto:20261110T150000')), 'UTC')
    expect(rows[0].starts_at).toBe('2026-11-10T19:00:00.000Z') // EST, UTC-5
  })

  it('stores an all-day event as local midnight to midnight with all_day set', () => {
    const { rows } = parseIcs(cal(event('DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261021')), TORONTO)
    expect(rows[0]).toMatchObject({ all_day: true, starts_at: '2026-10-20T04:00:00.000Z', ends_at: '2026-10-21T04:00:00.000Z' })
  })

  it('falls back to DURATION when DTEND is missing', () => {
    const { rows } = parseIcs(cal(event('DTSTART:20261019T140000Z', 'DURATION:PT1H30M')), TORONTO)
    expect(rows[0].ends_at).toBe('2026-10-19T15:30:00.000Z')
  })

  it('reports an unknown time zone instead of guessing', () => {
    const { rows, errors } = parseIcs(cal(event('DTSTART;TZID=Not/AZone:20261019T140000', 'DTEND;TZID=Not/AZone:20261019T150000')), TORONTO)
    expect(rows).toHaveLength(0)
    expect(errors[0].message).toMatch(/time zone/i)
  })
})

describe('parseIcs: field mapping', () => {
  it('maps title, notes, rrule and exdates; unfolds and unescapes text', () => {
    const { rows } = parseIcs(
      cal(
        event(
          'DTSTART:20261019T140000Z',
          'DTEND:20261019T150000Z',
          'DESCRIPTION:Bring the\r\n  zucchini\\, please\\nThanks',
          'RRULE:FREQ=WEEKLY;COUNT=4',
          'EXDATE:20261026T140000Z',
        ),
      ),
      TORONTO,
    )
    expect(rows[0].title).toBe('Lunch')
    expect(rows[0].notes).toBe('Bring the zucchini, please\nThanks')
    expect(rows[0].rrule).toBe('FREQ=WEEKLY;COUNT=4')
    expect(rows[0].exdates).toEqual(['2026-10-26T14:00:00.000Z'])
  })

  it('gives an untitled event a placeholder title and skips cancelled ones', () => {
    const { rows } = parseIcs(
      cal(
        'BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261019T140000Z\r\nDTEND:20261019T150000Z\r\nEND:VEVENT',
        event('DTSTART:20261019T140000Z', 'DTEND:20261019T150000Z', 'STATUS:CANCELLED'),
      ),
      TORONTO,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('(no title)')
  })

  it('ignores non-VEVENT components and keeps going past a bad event', () => {
    const { rows, errors } = parseIcs(
      cal('BEGIN:VTODO\r\nUID:t\r\nSUMMARY:todo\r\nEND:VTODO', 'BEGIN:VEVENT\r\nUID:bad\r\nSUMMARY:no start\r\nEND:VEVENT', event('DTSTART:20261019T140000Z', 'DTEND:20261019T150000Z')),
      TORONTO,
    )
    expect(rows).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })
})

describe('upload handling', () => {
  const ics = cal(event('DTSTART:20261019T140000Z', 'DTEND:20261019T150000Z'))

  it('detects type by content', () => {
    expect(detectType(strToU8(ics))).toBe('ics')
    expect(detectType(zipSync({ 'a.ics': strToU8(ics) }))).toBe('zip')
    expect(detectType(strToU8('hello'))).toBeNull()
  })

  it('reads every .ics in a zip and ignores other files', () => {
    const second = cal(event('DTSTART:20261020T140000Z', 'DTEND:20261020T150000Z').replace('u1@test', 'u2@test'))
    const zip = zipSync({ 'Calendar/a.ics': strToU8(ics), 'Calendar/b.ICS': strToU8(second), 'readme.txt': strToU8('x') })
    expect(parseUpload(zip, TORONTO).rows.map((r) => r.uid).sort()).toEqual(['u1@test', 'u2@test'])
  })

  it('rejects a wrong file type with 415', () => {
    expect(() => parseUpload(strToU8('not a calendar'), TORONTO)).toThrowError(expect.objectContaining({ status: 415 }))
  })

  it('rejects a zip with no .ics with 422', () => {
    expect(() => parseUpload(zipSync({ 'a.txt': strToU8('x') }), TORONTO)).toThrowError(expect.objectContaining({ status: 422 }))
  })

  it('rejects a zip with too many entries with 413', () => {
    const files = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`f${i}.ics`, strToU8(ics)]))
    expect(() => parseUpload(zipSync(files), TORONTO)).toThrowError(ImportError)
  })

  it('rejects an oversized upload with 413', () => {
    expect(() => parseUpload(new Uint8Array(11 * 1024 * 1024), TORONTO)).toThrowError(expect.objectContaining({ status: 413 }))
  })
})

describe('expandEvents', () => {
  const weekly = (extra: Partial<Parameters<typeof expandEvents>[0][number]> = {}) => ({
    id: 's1', uid: 'series', recurrence_id: null, title: 'Dinner', notes: null,
    starts_at: '2026-10-28T22:00:00.000Z', // Wed 6 pm Toronto (EDT)
    ends_at: '2026-10-28T23:00:00.000Z',
    all_day: false, rrule: 'FREQ=WEEKLY;COUNT=3', exdates: [], source_tz: TORONTO, ...extra,
  })
  const win = [new Date('2026-10-01T00:00:00Z'), new Date('2026-12-31T00:00:00Z')] as const

  it('keeps the local wall-clock time across the DST change', () => {
    const starts = expandEvents([weekly()], ...win).map((o) => o.starts_at)
    expect(starts).toEqual(['2026-10-28T22:00:00.000Z', '2026-11-04T23:00:00.000Z', '2026-11-11T23:00:00.000Z'])
  })

  it('applies EXDATE', () => {
    const out = expandEvents([weekly({ exdates: ['2026-11-04T23:00:00.000Z'] })], ...win)
    expect(out).toHaveLength(2)
  })

  it('replaces an occurrence with its RECURRENCE-ID override', () => {
    const override = weekly({ id: 's2', rrule: null, recurrence_id: '2026-11-04T23:00:00.000Z', title: 'Dinner (moved)', starts_at: '2026-11-05T23:00:00.000Z', ends_at: '2026-11-06T00:00:00.000Z' })
    const out = expandEvents([weekly(), override], ...win)
    expect(out.map((o) => o.title)).toEqual(['Dinner', 'Dinner (moved)', 'Dinner'])
  })

  it('only returns occurrences inside the window and caps an endless rule', () => {
    const daily = weekly({ rrule: 'FREQ=DAILY' })
    const out = expandEvents([daily], new Date('2026-11-01T00:00:00Z'), new Date('2026-11-08T00:00:00Z'))
    expect(out).toHaveLength(7)
    expect(expandEvents([daily], new Date('2026-10-01T00:00:00Z'), new Date('2030-01-01T00:00:00Z')).length).toBeLessThanOrEqual(2000)
  })
})
