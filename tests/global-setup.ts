import './helpers/env'
import { hasTestDb } from './helpers/env'
import { cleanupAllTestData } from './helpers/cleanup'

// Clear leftovers from a crashed earlier run, and again when this run finishes.
export async function setup() {
  if (!hasTestDb()) return
  try {
    await cleanupAllTestData()
  } catch (error) {
    console.warn('Supabase test cleanup skipped during setup:', error instanceof Error ? error.message : error)
  }
}

export async function teardown() {
  if (!hasTestDb()) return
  try {
    await cleanupAllTestData()
  } catch (error) {
    console.warn('Supabase test cleanup skipped during teardown:', error instanceof Error ? error.message : error)
  }
}
