import { createRequire } from 'node:module'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

// Push handling inside the service worker. The logic lives in public/sw-push.js, a plain script that
// works both under importScripts (in the worker) and under require (here), so it can be unit-tested.

const PUBLIC = path.resolve(import.meta.dirname, '../../public')
const require = createRequire(import.meta.url)

// Loaded per call so a missing file fails each test clearly instead of breaking the whole suite.
const load = () => require(path.join(PUBLIC, 'sw-push.js')) as {
  resolveNotificationTarget(data?: Record<string, string> | null): string
  buildNotification(payload?: unknown): { title: string; options: Record<string, any> }
  handlePush(event: any, registration: any): Promise<unknown>
  handleNotificationClick(event: any, clients: any): Promise<unknown>
}

describe('resolveNotificationTarget', () => {
  it('opens the opportunity page for an opportunity push', () => {
    expect(load().resolveNotificationTarget({ opportunity_id: 'opp-1' })).toBe('/opportunities/opp-1')
  })

  it('encodes the id so it cannot change the path or add a query', () => {
    expect(load().resolveNotificationTarget({ opportunity_id: 'a/b?x=1' })).toBe('/opportunities/a%2Fb%3Fx%3D1')
  })

  it('opens the dashboard for a test push', () => {
    expect(load().resolveNotificationTarget({ type: 'test' })).toBe('/')
  })

  it.each([undefined, null, {}, { opportunity_id: '' }])('falls back to the dashboard for %j', (data) => {
    expect(load().resolveNotificationTarget(data as never)).toBe('/')
  })

  it('never follows a URL sent in the data (no open redirect)', () => {
    expect(load().resolveNotificationTarget({ url: 'https://evil.example/phish' })).toBe('/')
  })
})

describe('buildNotification', () => {
  const payload = {
    notification: { title: 'A visit idea: zucchini', body: "'My zucchini...' Thu 4pm" },
    data: { opportunity_id: 'opp-1', slot_ids: 'a,b', urgency: 'high' },
  }

  it('uses the title and body FCM delivered', () => {
    const { title, options } = load().buildNotification(payload)
    expect(title).toBe('A visit idea: zucchini')
    expect(options.body).toBe("'My zucchini...' Thu 4pm")
  })

  it('remembers where a tap should go, for the click handler', () => {
    expect(load().buildNotification(payload).options.data).toEqual({ url: '/opportunities/opp-1' })
  })

  it('uses an icon that exists in public/icons', () => {
    const { options } = load().buildNotification(payload)
    expect(options.icon).toBe('/icons/icon-192.png')
    expect(existsSync(path.join(PUBLIC, options.icon))).toBe(true)
  })

  it('gives the same opportunity the same tag, so a repeat replaces instead of stacking', () => {
    expect(load().buildNotification(payload).options.tag).toBe('opportunity-opp-1')
  })

  it('keeps urgent pushes on screen until the person acts', () => {
    expect(load().buildNotification(payload).options.requireInteraction).toBe(true)
    const calm = { ...payload, data: { ...payload.data, urgency: 'normal' } }
    expect(load().buildNotification(calm).options.requireInteraction).toBeFalsy()
  })

  it('falls back to title and body in data when there is no notification block', () => {
    const { title, options } = load().buildNotification({ data: { title: 'Hi', body: 'There' } })
    expect(title).toBe('Hi')
    expect(options.body).toBe('There')
  })

  it.each([undefined, null, {}, 'oops'])('still produces a readable notification for %j', (bad) => {
    const { title, options } = load().buildNotification(bad)
    expect(title).toMatch(/\S/)
    expect(options.data).toEqual({ url: '/' })
  })
})

describe('handlePush', () => {
  const event = (json: () => unknown) => ({ data: { json }, waitUntil: vi.fn() })

  it('shows the notification and keeps the worker alive until it is shown', async () => {
    const registration = { showNotification: vi.fn().mockResolvedValue(undefined) }
    const e = event(() => ({ notification: { title: 'T', body: 'B' }, data: { opportunity_id: 'opp-1' } }))

    await load().handlePush(e, registration)

    expect(registration.showNotification).toHaveBeenCalledWith('T', expect.objectContaining({ body: 'B' }))
    expect(e.waitUntil).toHaveBeenCalledTimes(1)
  })

  it('still shows something when the payload is not valid JSON (browsers require a visible notification)', async () => {
    const registration = { showNotification: vi.fn().mockResolvedValue(undefined) }
    const e = event(() => {
      throw new SyntaxError('Unexpected token')
    })

    await load().handlePush(e, registration)

    expect(registration.showNotification).toHaveBeenCalledTimes(1)
  })

  it('still shows something when the push carries no data at all', async () => {
    const registration = { showNotification: vi.fn().mockResolvedValue(undefined) }

    await load().handlePush({ data: null, waitUntil: vi.fn() }, registration)

    expect(registration.showNotification).toHaveBeenCalledTimes(1)
  })
})

describe('handleNotificationClick', () => {
  const click = (url?: string) => ({
    notification: { close: vi.fn(), data: url === undefined ? undefined : { url } },
    waitUntil: vi.fn(),
  })
  const windowClient = () => ({ focus: vi.fn().mockResolvedValue(undefined), navigate: vi.fn().mockResolvedValue(undefined) })

  it('closes the notification that was tapped', async () => {
    const e = click('/opportunities/opp-1')
    await load().handleNotificationClick(e, { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn() })
    expect(e.notification.close).toHaveBeenCalledTimes(1)
  })

  it('opens the target in a new window when the app is not open', async () => {
    const clients = { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn().mockResolvedValue(null) }

    await load().handleNotificationClick(click('/opportunities/opp-1'), clients)

    expect(clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true })
    expect(clients.openWindow).toHaveBeenCalledWith('/opportunities/opp-1')
  })

  it('reuses an open window: focuses it and navigates to the target, without opening another', async () => {
    const open = windowClient()
    const clients = { matchAll: vi.fn().mockResolvedValue([open]), openWindow: vi.fn() }

    await load().handleNotificationClick(click('/opportunities/opp-1'), clients)

    expect(open.focus).toHaveBeenCalledTimes(1)
    expect(open.navigate).toHaveBeenCalledWith('/opportunities/opp-1')
    expect(clients.openWindow).not.toHaveBeenCalled()
  })

  it('goes to the dashboard when the notification carries no target', async () => {
    const clients = { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn().mockResolvedValue(null) }
    await load().handleNotificationClick(click(undefined), clients)
    expect(clients.openWindow).toHaveBeenCalledWith('/')
  })

  it('keeps the worker alive until the window work finishes', async () => {
    const e = click('/')
    await load().handleNotificationClick(e, { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn() })
    expect(e.waitUntil).toHaveBeenCalledTimes(1)
  })
})

describe('one service worker for the app', () => {
  // Runs public/sw.js in a fake worker scope and records what it registers.
  function runWorker() {
    const listeners: Record<string, unknown> = {}
    const caches = { open: vi.fn().mockResolvedValue({ add: vi.fn() }), keys: vi.fn(), match: vi.fn() }
    const self: Record<string, unknown> = {
      addEventListener: (type: string, fn: unknown) => (listeners[type] = fn),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(), matchAll: vi.fn(), openWindow: vi.fn() },
      registration: { showNotification: vi.fn() },
      // importScripts('/sw-push.js') runs that file in the same scope, as a real worker would.
      importScripts: (file: string) =>
        vm.runInContext(readFileSync(path.join(PUBLIC, file.replace(/^\//, '')), 'utf8'), context),
    }
    const context = vm.createContext({ self, caches, fetch: vi.fn(), console })
    vm.runInContext(readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8'), context)
    return { listeners, caches }
  }

  it('handles push and notification taps in the same worker as the offline shell', () => {
    const { listeners } = runWorker()
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install', 'notificationclick', 'push'])
  })

  it('keeps the offline fallback working (still precaches the offline page on install)', () => {
    const { listeners, caches } = runWorker()
    const waitUntil = vi.fn()
    ;(listeners.install as (e: unknown) => void)({ waitUntil })
    expect(caches.open).toHaveBeenCalledWith('sodalis-shell-v1')
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })

  it('has no second Firebase worker competing for the same scope', () => {
    expect(existsSync(path.join(PUBLIC, 'firebase-messaging-sw.js'))).toBe(false)
  })

  it('does not hardcode a Firebase API key anywhere in public/', () => {
    const scripts = readdirSync(PUBLIC).filter((f) => f.endsWith('.js'))
    for (const file of scripts) {
      expect(readFileSync(path.join(PUBLIC, file), 'utf8'), file).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/)
    }
  })
})

describe('alert pushes (flag_concern): tapping calls the elder', () => {
  const alert = { type: 'alert', urgency: 'high', elder_phone: '+14155550142' }
  const click = (url: string) => ({ notification: { close: vi.fn(), data: { url } }, waitUntil: vi.fn() })

  it("targets the phone app with the elder's number", () => {
    expect(load().resolveNotificationTarget(alert)).toBe('tel:+14155550142')
  })

  it.each(['4155550142', '+1 415 555 0142', 'javascript:alert(1)', '+14155550142?x', ''])(
    'never dials something that is not an E.164 number (%j)',
    (elder_phone) => {
      expect(load().resolveNotificationTarget({ ...alert, elder_phone })).toBe('/')
    },
  )

  it('stays on screen until the person acts', () => {
    const { options } = load().buildNotification({ notification: { title: 'Jane may need help' }, data: alert })
    expect(options.requireInteraction).toBe(true)
    expect(options.data.url).toBe('tel:+14155550142')
    expect(options.tag).toBe('alert')
  })

  it('opens the dialer instead of navigating the open app away', async () => {
    const open = { focus: vi.fn(), navigate: vi.fn() }
    const clients = { matchAll: vi.fn().mockResolvedValue([open]), openWindow: vi.fn().mockResolvedValue(null) }

    await load().handleNotificationClick(click('tel:+14155550142'), clients)

    expect(clients.openWindow).toHaveBeenCalledWith('tel:+14155550142')
    expect(open.navigate).not.toHaveBeenCalled()
  })

  it('opens the dashboard when the browser cannot dial', async () => {
    const openWindow = vi.fn().mockRejectedValueOnce(new TypeError('not allowed')).mockResolvedValue(null)
    const e = click('tel:+14155550142')

    await load().handleNotificationClick(e, { matchAll: vi.fn(), openWindow })

    expect(openWindow).toHaveBeenLastCalledWith('/')
    expect(e.waitUntil).toHaveBeenCalledTimes(1)
  })

  it('ignores a tel: link that is not a plain number', async () => {
    const clients = { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn().mockResolvedValue(null) }
    await load().handleNotificationClick(click('tel:+1415;ext=evil'), clients)
    expect(clients.openWindow).toHaveBeenCalledWith('/')
  })
})
