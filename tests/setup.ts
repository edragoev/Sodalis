import { afterEach } from 'vitest'
import './helpers/env'
import { hasTestDb } from './helpers/env'
import { cleanupTracked } from './helpers/cleanup'

// Runs after every test in every file. Skipped when no test DB is configured,
// so pure unit tests still work without Supabase.
afterEach(async () => {
  if (hasTestDb()) await cleanupTracked()
})
