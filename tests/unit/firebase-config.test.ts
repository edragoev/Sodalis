import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getFirebaseConfig } from '@/lib/firebase/config'

const VARS = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123:web:abc',
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: 'G-XYZ',
}

const saved = { ...process.env }

beforeEach(() => Object.assign(process.env, VARS))
afterEach(() => {
  for (const key of Object.keys(VARS)) delete process.env[key]
  Object.assign(process.env, saved)
})

describe('getFirebaseConfig', () => {
  it('reads the web config from NEXT_PUBLIC_FIREBASE_* variables', () => {
    expect(getFirebaseConfig()).toEqual({
      apiKey: 'key',
      authDomain: 'demo.firebaseapp.com',
      projectId: 'demo',
      storageBucket: 'demo.firebasestorage.app',
      messagingSenderId: '123',
      appId: '1:123:web:abc',
      measurementId: 'G-XYZ',
    })
  })

  it('treats the measurement id (analytics) as optional', () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
    expect(getFirebaseConfig().measurementId).toBeUndefined()
  })

  it.each([
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
  ])('throws a clear error when %s is missing', (name) => {
    delete process.env[name]
    expect(() => getFirebaseConfig()).toThrow(name)
  })

  it('treats a blank value as missing', () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = '   '
    expect(() => getFirebaseConfig()).toThrow('NEXT_PUBLIC_FIREBASE_API_KEY')
  })
})
