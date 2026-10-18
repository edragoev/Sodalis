import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const KEY_ENV = 'ENCRYPTION_KEY'
const KEY_BYTES = 32

function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY ?? process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error(`Missing ${KEY_ENV} for Google token encryption`)

  const asHex = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (asHex.length !== KEY_BYTES) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes`)
  }
  return asHex
}

export function encryptToken(token: string) {
  const iv = randomBytes(12)
  const key = getEncryptionKey()
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`
}

export function decryptToken(value: string) {
  const match = /^v1:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/.exec(value)
  if (!match) throw new Error('Invalid encrypted Google refresh token format')

  const [, ivB64, tagB64, dataB64] = match
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const encrypted = Buffer.from(dataB64, 'base64url')

  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv)
  decipher.setAuthTag(tag)

  const out = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return out.toString('utf8')
}
