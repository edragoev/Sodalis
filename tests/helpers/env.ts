import { config } from 'dotenv'
import path from 'node:path'

// Test credentials live in .env.test (gitignored), never in .env.local, so a
// test run can't touch the project's real Supabase by accident.
config({ path: path.resolve(__dirname, '../../.env.test'), quiet: true })

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', 'host.docker.internal'])

export interface TestEnv {
  url: string
  anonKey: string
  serviceRoleKey: string
}

/** True when the three TEST_SUPABASE_* variables are present. */
export function hasTestDb(): boolean {
  return Boolean(
    process.env.TEST_SUPABASE_URL &&
      process.env.TEST_SUPABASE_ANON_KEY &&
      process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
  )
}

/**
 * Reads and validates the test database settings. Refuses any non-local URL
 * unless ALLOW_REMOTE_TEST_DB=true, because cleanup deletes rows.
 */
export function getTestEnv(): TestEnv {
  const url = process.env.TEST_SUPABASE_URL
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY / TEST_SUPABASE_SERVICE_ROLE_KEY. ' +
        'Copy .env.test.example to .env.test and fill it in.'
    )
  }
  const host = new URL(url).hostname
  if (!LOCAL_HOSTS.has(host) && process.env.ALLOW_REMOTE_TEST_DB !== 'true') {
    throw new Error(
      `Refusing to run tests against non-local Supabase host "${host}". ` +
        'Use a local instance (supabase start) or set ALLOW_REMOTE_TEST_DB=true for a dedicated test project.'
    )
  }
  return { url, anonKey, serviceRoleKey }
}
