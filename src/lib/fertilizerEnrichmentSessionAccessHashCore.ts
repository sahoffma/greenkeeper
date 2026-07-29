import { createHmac } from 'node:crypto'

export type DeriveSessionAccessHash = (sessionId: string) => string

const SESSION_ACCESS_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/

export function createDeriveSessionAccessHash(secret: string): DeriveSessionAccessHash {
  const normalizedSecret = secret.trim()
  if (!normalizedSecret) {
    throw new Error('Session access HMAC secret must not be empty.')
  }

  return (sessionId: string) => {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) {
      throw new Error('sessionId must not be empty for session access hash derivation.')
    }

    return createHmac('sha256', normalizedSecret).update(normalizedSessionId, 'utf8').digest('hex')
  }
}

export function isValidSessionAccessHash(value: string): boolean {
  return SESSION_ACCESS_HASH_HEX_PATTERN.test(value)
}
