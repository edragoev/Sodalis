import { describe, expect, it, vi } from 'vitest'
import { registerToken } from '@/lib/push-registration'

// The browser's call to POST /api/push/register, which stores a member's FCM token.

const reply = (status: number) => vi.fn().mockResolvedValue(new Response('{}', { status }))

describe('registerToken', () => {
  it('posts the member and token as JSON to /api/push/register', async () => {
    const fetchFn = reply(200)

    await registerToken('m1', 'tok-abc', fetchFn)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('/api/push/register')
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ member_id: 'm1', token: 'tok-abc' })
  })

  it('reports success for a 200', async () => {
    await expect(registerToken('m1', 'tok-abc', reply(200))).resolves.toEqual({ ok: true })
  })

  it.each([400, 404, 500])('reports failure for HTTP %i', async (status) => {
    await expect(registerToken('m1', 'tok-abc', reply(status))).resolves.toEqual({ ok: false })
  })

  it('reports failure, instead of throwing, when the network is down', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(registerToken('m1', 'tok-abc', fetchFn)).resolves.toEqual({ ok: false })
  })

  it('never puts the token in what it returns', async () => {
    const result = await registerToken('m1', 'secret-token', reply(200))
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })
})
