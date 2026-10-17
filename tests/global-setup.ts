import './helpers/env'
import { hasTestDb } from './helpers/env'
import { cleanupAllTestData } from './helpers/cleanup'

// Clear leftovers from a crashed earlier run, and again when this run finishes.
export async function setup() {
  if (hasTestDb()) await cleanupAllTestData()
}

export async function teardown() {
  if (hasTestDb()) await cleanupAllTestData()
}
