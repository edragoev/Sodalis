import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Server-side Firebase (firebase-admin) is mocked: these tests check how we call it, not Firebase.
const initializeApp = vi.fn((options: unknown) => ({ name: '[DEFAULT]', options }))
const cert = vi.fn((credential: unknown) => ({ credential }))
const getApps = vi.fn(() => [] as unknown[])
const getMessaging = vi.fn(() => ({ send: vi.fn() }))

vi.mock('firebase-admin/app', () => ({ initializeApp, cert, getApps, getApp: vi.fn(() => ({ name: '[DEFAULT]' })) }))
vi.mock('firebase-admin/messaging', () => ({ getMessaging }))

const saved = { ...process.env }

async function load() {
  vi.resetModules()
  return import('@/lib/firebase/admin')
}

beforeEach(() => {
  vi.clearAllMocks()
  getApps.mockReturnValue([])
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-project'
  process.env.FIREBASE_CLIENT_EMAIL = 'svc@demo-project.iam.gserviceaccount.com'
  process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
})

afterEach(() => {
  process.env = { ...saved }
})

describe('getAdminMessaging', () => {
  it('initializes the app from the three env variables', async () => {
    const { getAdminMessaging } = await load()
    getAdminMessaging()

    expect(cert).toHaveBeenCalledWith({
      projectId: 'demo-project',
      clientEmail: 'svc@demo-project.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    })
    expect(initializeApp).toHaveBeenCalledTimes(1)
  })

  it('turns escaped \\n in the private key into real newlines (how hosts store it)', async () => {
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n'
    const { getAdminMessaging } = await load()
    getAdminMessaging()

    expect(cert.mock.calls[0][0]).toMatchObject({
      privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    })
  })

  it('reuses an app that already exists instead of initializing twice', async () => {
    getApps.mockReturnValue([{ name: '[DEFAULT]' }])
    const { getAdminMessaging } = await load()
    getAdminMessaging()
    getAdminMessaging()

    expect(initializeApp).not.toHaveBeenCalled()
  })

  it('returns the Firebase messaging instance', async () => {
    const messaging = { send: vi.fn() }
    getMessaging.mockReturnValue(messaging)
    const { getAdminMessaging } = await load()

    expect(getAdminMessaging()).toBe(messaging)
  })

  it.each(['NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'])(
    'names the missing variable when %s is not set',
    async (name) => {
      delete process.env[name]
      const { getAdminMessaging } = await load()

      expect(() => getAdminMessaging()).toThrow(name)
      expect(initializeApp).not.toHaveBeenCalled()
    },
  )

  it('never puts the private key in an error message', async () => {
    delete process.env.FIREBASE_CLIENT_EMAIL
    const { getAdminMessaging } = await load()

    let message = ''
    try {
      getAdminMessaging()
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).not.toBe('') // it did throw
    expect(message).not.toContain('BEGIN PRIVATE KEY')
  })
})
