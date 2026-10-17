import { randomInt, randomUUID } from 'node:crypto'
import { adminClient } from './supabase'
import { TEST_PHONE_PREFIX, track } from './cleanup'

type Row = Record<string, unknown>

async function insert(table: string, values: Row): Promise<Row> {
  const { data, error } = await adminClient().from(table).insert(values).select().single()
  if (error) throw new Error(`factory insert into ${table} failed: ${error.message}`)
  return data as Row
}

/** A unique, test-prefixed E.164 number, so cleanup can find it. */
const usedPhones = new Set<string>()
export function testPhone(): string {
  let phone: string
  do {
    phone = `${TEST_PHONE_PREFIX}${String(randomInt(0, 10_000)).padStart(4, '0')}`
  } while (usedPhones.has(phone))
  usedPhones.add(phone)
  return phone
}

export async function createSenior(overrides: Row = {}): Promise<Row> {
  const row = await insert('seniors', {
    name: 'Test Elder',
    phone_e164: testPhone(),
    timezone: 'America/Toronto',
    ...overrides,
  })
  track('seniors', row.id as string)
  return row
}

export async function createFamilyMember(seniorId: string, overrides: Row = {}): Promise<Row> {
  return insert('family_members', {
    senior_id: seniorId,
    // Unique per call: (senior_id, lower(name)) is a unique constraint.
    name: `Member ${randomUUID().slice(0, 8)}`,
    relationship: 'grandchild',
    ...overrides,
  })
}

export async function createCheckIn(seniorId: string, overrides: Row = {}): Promise<Row> {
  return insert('check_ins', {
    senior_id: seniorId,
    vapi_call_id: `test-${randomUUID()}`,
    started_at: new Date().toISOString(),
    status: 'completed',
    ...overrides,
  })
}

export async function createOpportunity(
  seniorId: string,
  checkInId: string,
  overrides: Row = {}
): Promise<Row> {
  return insert('opportunities', {
    senior_id: seniorId,
    check_in_id: checkInId,
    type: 'gift_errand',
    summary: 'Has extra zucchini',
    quote: 'My zucchini are out of control.',
    urgency: 'normal',
    confidence: 0.9,
    status: 'detected',
    ...overrides,
  })
}
