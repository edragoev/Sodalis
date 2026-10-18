import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'

// Chainable stand-in for the supabase query builder: every method returns itself and awaiting it
// yields the configured result for that table.
const calls: { table: string; method: string; args: unknown[] }[] = []
const results: Record<string, any> = {}

function builder(table: string) {
  const b: any = new Proxy(() => {}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: any) => res(results[table] ?? { data: [], error: null })
      return (...args: unknown[]) => {
        calls.push({ table, method: prop, args })
        return b
      }
    },
  })
  return b
}
vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: () => ({ from: builder }) }))

import { POST } from '@/app/api/calendar/import/route'
import { DELETE } from '@/app/api/calendar/import/[batchId]/route'
import { GET } from '@/app/api/calendar/events/route'

const MEMBER = '11111111-1111-4111-8111-111111111111'
const BATCH = '22222222-2222-4222-8222-222222222222'
const ics = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//EN',
  'BEGIN:VEVENT', 'UID:u1', 'SUMMARY:Lunch', 'DTSTART;TZID=America/Toronto:20261019T140000', 'DTEND;TZID=America/Toronto:20261019T150000', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

function upload(file: Uint8Array | null, member: string | null = MEMBER, name = 'cal.ics') {
  const form = new FormData()
  if (file) form.set('file', new File([file as BlobPart], name))
  if (member) form.set('member_id', member)
  return POST(new Request('http://localhost:3000/api/calendar/import', { method: 'POST', body: form }))
}
const upserted = () => calls.find((c) => c.table === 'calendar_events' && c.method === 'upsert')

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(results)) delete results[k]
  results.family_members = { data: { id: MEMBER, seniors: { timezone: 'America/Toronto' } }, error: null }
  results.calendar_events = { data: [], error: null }
})

describe('POST /api/calendar/import', () => {
  it('imports an .ics, normalizing times to UTC', async () => {
    const res = await upload(strToU8(ics))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ imported: 1, updated: 0, skipped: 0 })
    expect(json.batch_id).toMatch(/^[0-9a-f-]{36}$/)
    const rows = upserted()!.args[0] as any[]
    expect(rows[0]).toMatchObject({ member_id: MEMBER, uid: 'u1', title: 'Lunch', starts_at: '2026-10-19T18:00:00.000Z' })
    expect(upserted()!.args[1]).toMatchObject({ onConflict: 'member_id,uid,recurrence_id' })
  })

  it('imports a .zip', async () => {
    const res = await upload(zipSync({ 'Calendar/a.ics': strToU8(ics) }), MEMBER, 'takeout.zip')
    expect(res.status).toBe(200)
    expect((await res.json()).imported).toBe(1)
  })

  it('counts a re-import as updated, not imported', async () => {
    results.calendar_events = { data: [{ uid: 'u1', recurrence_id: null }], error: null }
    const json = await (await upload(strToU8(ics))).json()
    expect(json).toMatchObject({ imported: 0, updated: 1 })
  })

  it('400 when the file or member_id is missing', async () => {
    expect((await upload(null)).status).toBe(400)
    expect((await upload(strToU8(ics), null)).status).toBe(400)
    expect(upserted()).toBeUndefined()
  })

  it('404 for an unknown member', async () => {
    results.family_members = { data: null, error: null }
    expect((await upload(strToU8(ics))).status).toBe(404)
  })

  it('415 for a file that is not a calendar', async () => {
    expect((await upload(strToU8('hello'))).status).toBe(415)
    expect(upserted()).toBeUndefined()
  })

  it('422 for a calendar with no events', async () => {
    const res = await upload(strToU8('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//t//EN\r\nEND:VCALENDAR'))
    expect(res.status).toBe(422)
  })
})

describe('GET /api/calendar/events', () => {
  const get = (qs: string) => GET(new Request(`http://localhost:3000/api/calendar/events?${qs}`))
  const row = {
    id: 'e1', uid: 'u1', recurrence_id: null, title: 'Dinner', notes: null, all_day: false,
    starts_at: '2026-10-28T22:00:00+00:00', ends_at: '2026-10-28T23:00:00+00:00',
    rrule: 'FREQ=WEEKLY;COUNT=3', exdates: [], source_tz: 'America/Toronto',
  }

  it('returns occurrences with series expanded', async () => {
    results.calendar_events = { data: [row], error: null }
    const res = await get(`member_id=${MEMBER}&from=2026-10-01T00:00:00Z&to=2026-12-01T00:00:00Z`)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.events.map((e: any) => e.starts_at)).toEqual(['2026-10-28T22:00:00.000Z', '2026-11-04T23:00:00.000Z', '2026-11-11T23:00:00.000Z'])
  })

  it('400 without member_id or a valid window, and when the window is over a year', async () => {
    expect((await get('from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z')).status).toBe(400)
    expect((await get(`member_id=${MEMBER}&from=nope&to=2026-11-01T00:00:00Z`)).status).toBe(400)
    expect((await get(`member_id=${MEMBER}&from=2026-01-01T00:00:00Z&to=2028-01-01T00:00:00Z`)).status).toBe(400)
  })
})

describe('DELETE /api/calendar/import/[batchId]', () => {
  const del = (batchId: string, qs = `member_id=${MEMBER}`) =>
    DELETE(new Request(`http://localhost:3000/api/calendar/import/${batchId}?${qs}`, { method: 'DELETE' }), { params: Promise.resolve({ batchId }) })

  it('removes one upload, scoped to the member', async () => {
    results.calendar_events = { data: [{ id: 'a' }, { id: 'b' }], error: null }
    const res = await del(BATCH)
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(2)
    const eqs = calls.filter((c) => c.method === 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['import_batch_id', BATCH])
    expect(eqs).toContainEqual(['member_id', MEMBER])
  })

  it('400 for a malformed batch id or missing member_id', async () => {
    expect((await del('not-a-uuid')).status).toBe(400)
    expect((await del(BATCH, '')).status).toBe(400)
  })
})
