import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hasTestDb } from '../helpers/env'
import { adminClient } from '../helpers/supabase'
import { createSenior } from '../helpers/factories'
import { insertCheckIn, listCheckIns } from '@/lib/check-ins'

const callId = () => `test-${randomUUID()}`

describe.skipIf(!hasTestDb())('check_ins', () => {
  it('inserts a record with a unique vapi_call_id', async () => {
    const senior = await createSenior()
    const vapiCallId = callId()

    const row = await insertCheckIn(adminClient(), {
      senior_id: senior.id as string,
      vapi_call_id: vapiCallId,
      started_at: '2026-10-01T10:00:00Z',
    })

    expect(row.id).toBeTruthy()
    expect(row.vapi_call_id).toBe(vapiCallId)
    expect(row.senior_id).toBe(senior.id)
  })

  it('throws when the vapi_call_id already exists (idempotency constraint)', async () => {
    const senior = await createSenior()
    const input = {
      senior_id: senior.id as string,
      vapi_call_id: callId(),
      started_at: '2026-10-01T10:00:00Z',
    }
    await insertCheckIn(adminClient(), input)

    await expect(insertCheckIn(adminClient(), input)).rejects.toMatchObject({
      code: '23505', // Postgres unique_violation
    })

    const { count } = await adminClient()
      .from('check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('vapi_call_id', input.vapi_call_id)
    expect(count).toBe(1)
  })

  it('returns check-ins ordered by started_at DESC', async () => {
    const senior = await createSenior()
    const seniorId = senior.id as string
    // Inserted out of order on purpose, so insertion order can't pass this by luck.
    for (const startedAt of [
      '2026-10-02T09:00:00Z',
      '2026-10-04T09:00:00Z',
      '2026-10-01T09:00:00Z',
      '2026-10-03T09:00:00Z',
    ]) {
      await insertCheckIn(adminClient(), {
        senior_id: seniorId,
        vapi_call_id: callId(),
        started_at: startedAt,
      })
    }

    const rows = await listCheckIns(adminClient(), seniorId)

    expect(rows.map((r) => r.started_at)).toEqual([
      '2026-10-04T09:00:00+00:00',
      '2026-10-03T09:00:00+00:00',
      '2026-10-02T09:00:00+00:00',
      '2026-10-01T09:00:00+00:00',
    ])
  })

  it('only returns check-ins for the requested senior', async () => {
    const a = await createSenior()
    const b = await createSenior()
    await insertCheckIn(adminClient(), {
      senior_id: a.id as string,
      vapi_call_id: callId(),
      started_at: '2026-10-01T09:00:00Z',
    })

    expect(await listCheckIns(adminClient(), b.id as string)).toEqual([])
  })
})
