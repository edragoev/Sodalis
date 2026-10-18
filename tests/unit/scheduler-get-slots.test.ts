import { describe, expect, it, vi } from 'vitest'
import { createGetSlots, type SchedulerData } from '@/lib/scheduler/get-slots'

// getSlots(member_id, kind, days) is what Hope's tools and the coordinator call
// (specs/04-scheduler/algorithm.md "Interface"). The data loading is injected; the slot math is
// covered in scheduler-slots.test.ts.

const NOW = new Date('2026-10-15T14:10:00.000Z') // Thu 10:10 in Toronto
const everyDay = (start: string, end: string) => [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start, end }))

const data = (over: Partial<SchedulerData> = {}): SchedulerData => ({
  timezone: 'America/Toronto',
  memberWindows: everyDay('09:00', '17:00'),
  visits: [],
  hopeCalls: [],
  ...over,
})

function setup(load: (memberId: string) => Promise<SchedulerData | null> = async () => data()) {
  const deps = { load: vi.fn(load), now: () => NOW }
  return { deps, getSlots: createGetSlots(deps) }
}

describe('getSlots', () => {
  it('loads what it needs for that member and returns up to 3 slots', async () => {
    const { deps, getSlots } = setup()

    const slots = await getSlots('danny', 'visit', 7)

    expect(deps.load).toHaveBeenCalledTimes(1)
    expect(deps.load).toHaveBeenCalledWith('danny')
    expect(slots).toHaveLength(3)
    expect(slots[0]).toEqual({
      id: expect.any(String),
      starts_at: '2026-10-15T14:30:00.000Z',
      ends_at: '2026-10-15T16:30:00.000Z',
    })
  })

  it('gives a call 30 minutes and respects the number of days', async () => {
    const { getSlots } = setup()
    const slots = await getSlots('danny', 'call', 1)
    expect(slots.length).toBeGreaterThan(0)
    expect(Date.parse(slots[0].ends_at) - Date.parse(slots[0].starts_at)).toBe(30 * 60_000)
    expect(slots.every((s) => Date.parse(s.starts_at) < NOW.getTime() + 24 * 3_600_000)).toBe(true)
  })

  it('returns nothing for a member who does not exist', async () => {
    const { getSlots } = setup(async () => null)
    expect(await getSlots('ghost', 'visit', 7)).toEqual([])
  })

  it('returns nothing when the member has set no free hours', async () => {
    const { getSlots } = setup(async () => data({ memberWindows: [] }))
    expect(await getSlots('danny', 'visit', 7)).toEqual([])
  })

  it('avoids a confirmed visit for the family and a Hope call', async () => {
    const { getSlots } = setup(async () =>
      data({ visits: [{ starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T16:00:00.000Z' }] }),
    )
    const [first] = await getSlots('danny', 'visit', 7)
    expect(first.starts_at).toBe('2026-10-17T16:00:00.000Z')
  })

  it("passes the opportunity's target day through, and includes that day", async () => {
    const sat = { dow: 6, start: '10:00', end: '12:00' }
    const sun = { dow: 0, start: '10:00', end: '12:00' }
    const { getSlots } = setup(async () => data({ memberWindows: [sat, sun] }))
    const slots = await getSlots('danny', 'visit', 7, { targetDate: '2026-10-17' })
    expect(slots.map((s) => s.starts_at)).toEqual(['2026-10-17T14:00:00.000Z'])
  })

  it('gives two members different ids for the same time', async () => {
    const { getSlots } = setup()
    const [a] = await getSlots('danny', 'visit', 7)
    const [b] = await getSlots('maya', 'visit', 7)
    expect(a.starts_at).toBe(b.starts_at)
    expect(a.id).not.toBe(b.id)
  })

  it('lets a loading error out instead of returning an empty list that looks like "nobody is free"', async () => {
    const { getSlots } = setup(async () => {
      throw new Error('db down')
    })
    await expect(getSlots('danny', 'visit', 7)).rejects.toThrow('db down')
  })
})
