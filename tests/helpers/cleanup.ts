import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from './supabase'

/** Every test senior gets a phone starting with this (555-01xx is reserved for fiction). */
export const TEST_PHONE_PREFIX = '+1555010'

/**
 * Tables that hold a senior_id, children first so foreign keys never block a delete.
 * `family_members` comes last because other tables point at it.
 */
const SENIOR_SCOPED_TABLES = [
  'opportunities',
  'visits',
  'call_requests',
  'alerts',
  'hope_calls',
  'check_ins',
  'family_members',
] as const

/** Tables with no senior_id; they hang off family_members and go first. */
const MEMBER_SCOPED_TABLES = ['member_profile_answers'] as const

type Tracked = Map<string, Set<string>>

const tracked: Tracked = new Map()

/** Remember a row so cleanupTracked() removes it. Returns the id for chaining. */
export function track(table: string, id: string): string {
  if (!tracked.has(table)) tracked.set(table, new Set())
  tracked.get(table)!.add(id)
  return id
}

async function del(db: SupabaseClient, table: string, column: string, ids: string[]) {
  if (ids.length === 0) return
  const { error } = await db.from(table).delete().in(column, ids)
  // A table that doesn't exist yet (migration not applied) shouldn't mask the real test failure.
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    throw new Error(`cleanup of ${table} failed: ${error.message}`)
  }
}

function isUnreachableDbError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return text.includes('fetch failed') || text.includes('econnrefused') || text.includes('enotfound') || text.includes('network')
}

async function deleteSeniors(db: SupabaseClient, seniorIds: string[]) {
  if (seniorIds.length === 0) return
  const { data: members } = await db.from('family_members').select('id').in('senior_id', seniorIds)
  const memberIds = (members ?? []).map((m: { id: string }) => m.id)
  for (const table of MEMBER_SCOPED_TABLES) await del(db, table, 'member_id', memberIds)
  for (const table of SENIOR_SCOPED_TABLES) await del(db, table, 'senior_id', seniorIds)
  await del(db, 'seniors', 'id', seniorIds)
}

/**
 * Deletes everything created by the current test: tracked rows, plus anything
 * the code under test (for example an API route) inserted for a tracked senior.
 */
export async function cleanupTracked(db: SupabaseClient = adminClient()) {
  const seniorIds = [...(tracked.get('seniors') ?? [])]
  tracked.clear()
  await deleteSeniors(db, seniorIds)
}

/**
 * Safety net for rows left by a crashed run: removes every senior whose phone
 * uses the test prefix, along with their data.
 */
export async function cleanupAllTestData(db: SupabaseClient = adminClient()) {
  try {
    const { data, error } = await db
      .from('seniors')
      .select('id')
      .like('phone_e164', `${TEST_PHONE_PREFIX}%`)
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return
      if (isUnreachableDbError(error)) {
        console.warn('Skipping Supabase test cleanup because the test database is unreachable.')
        return
      }
      throw new Error(`cleanup lookup failed: ${error.message}`)
    }
    await deleteSeniors(db, (data ?? []).map((s: { id: string }) => s.id))
  } catch (error) {
    if (error instanceof Error && isUnreachableDbError(error as { code?: string; message?: string })) {
      console.warn('Skipping Supabase test cleanup because the test database is unreachable.')
      return
    }
    throw error
  }
}
