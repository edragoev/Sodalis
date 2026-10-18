import { describe, expect, it } from 'vitest'
import { encryptToken } from '@/lib/google/crypto'
import { createSchedulerLoader } from '@/lib/scheduler/load'

process.env.ENCRYPTION_KEY ??= Buffer.from('12345678901234567890123456789012').toString('base64')

describe('Google Calendar loader', () => {
  it('loads live busy windows for a connected member', async () => {
    const googleToken = encryptToken('refresh-1')

    const fakeDb = {
      from: (table: string) => ({
        select: () => ({
          eq: (_column: string, value: string) => ({
            maybeSingle: async () => {
              if (table === 'family_members') {
                return {
                  data: {
                    id: value,
                    senior_id: 's1',
                    manual_availability: [{ dow: 1, start: '09:00', end: '17:00' }],
                    google_refresh_token: googleToken,
                    calendar_connected: true,
                  },
                  error: null,
                }
              }
              if (table === 'seniors') {
                return {
                  data: { id: 's1', timezone: 'America/Toronto', preferred_windows: [{ dow: 1, start: '09:00', end: '17:00' }] },
                  error: null,
                }
              }
              return { data: [], error: null }
            },
            in: () => ({ data: [], error: null }),
          }),
          in: () => ({ data: [], error: null }),
        }),
      }),
    }

    const loader = createSchedulerLoader(fakeDb as never, {
      fetchBusyWindows: async () => [{ start: '2026-10-16T14:00:00.000Z', end: '2026-10-16T16:00:00.000Z' }],
    })

    const result = await loader('member-1')

    expect(result?.busyWindows).toEqual([
      { starts_at: '2026-10-16T14:00:00.000Z', ends_at: '2026-10-16T16:00:00.000Z' },
    ])
  })
})
