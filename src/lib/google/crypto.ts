import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// AES-256-GCM for Google refresh tokens (specs/01-database/schema.md). Server only.
// Stored as `v1:<iv>:<tag>:<ciphertext>`, each part base64url.

const VERSION = 'v1'

// ENCRYPTION_KEY can be any secret string; it is hashed to the 32 bytes AES-256 needs.
function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) throw new Error('ENCRYPTION_KEY is not set')
  return createHash('sha256').update(secret).digest()
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const parts = [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url'))
  return [VERSION, ...parts].join(':')
}

export function decryptToken(stored: string): string {
  const [version, iv, tag, data] = stored.split(':')
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Unrecognised token format')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
