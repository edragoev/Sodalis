import { describe, expect, it, vi } from 'vitest'
import { checkToken } from '@/lib/firebase/verify-token'
import { verifyToken } from '@/lib/push-registration'

describe('checkToken', () => {
  it('sends a dry run, so nothing reaches the device, and calls a good token valid', async () => {
    const send = vi.fn().mockResolvedValue('id')
    expect(await checkToken({ send }, 'tok')).toBe('valid')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok' }), true)
  })

  it.each(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'])(
    'calls a token dead on %s',
    async (code) => {
      const send = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code }))
      expect(await checkToken({ send }, 'tok')).toBe('dead')
    },
  )

  it('rethrows transient errors instead of calling the token dead', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'messaging/internal-error' }))
    await expect(checkToken({ send }, 'tok')).rejects.toThrow()
  })
})

describe('verifyToken (browser)', () => {
  const answer = (status: number) => vi.fn().mockResolvedValue({ ok: status < 300, status }) as unknown as typeof fetch

  it('maps 200 to valid, 410 to dead, anything else to unknown', async () => {
    expect(await verifyToken('m1', answer(200))).toBe('valid')
    expect(await verifyToken('m1', answer(410))).toBe('dead')
    expect(await verifyToken('m1', answer(502))).toBe('unknown')
    expect(await verifyToken('m1', answer(409))).toBe('unknown')
  })

  it('treats a network failure as unknown, not dead', async () => {
    const down = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    expect(await verifyToken('m1', down)).toBe('unknown')
  })
})
