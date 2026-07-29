import { describe, expect, it } from 'vitest'
import {
  createDeriveSessionAccessHash,
  isValidSessionAccessHash,
} from './fertilizerEnrichmentSessionAccessHashCore'

describe('fertilizerEnrichmentSessionAccessHashCore', () => {
  it('H-1: derives deterministic lowercase hex HMAC', () => {
    const derive = createDeriveSessionAccessHash('test-secret')
    const first = derive('session-abc')
    const second = derive('session-abc')

    expect(first).toBe(second)
    expect(isValidSessionAccessHash(first)).toBe(true)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  it('H-2: different session ids produce different hashes', () => {
    const derive = createDeriveSessionAccessHash('test-secret')

    expect(derive('session-a')).not.toBe(derive('session-b'))
  })

  it('H-3: different secrets produce different hashes', () => {
    const deriveA = createDeriveSessionAccessHash('secret-a')
    const deriveB = createDeriveSessionAccessHash('secret-b')

    expect(deriveA('session-1')).not.toBe(deriveB('session-1'))
  })

  it('H-4: rejects empty secret', () => {
    expect(() => createDeriveSessionAccessHash('   ')).toThrow(/secret/i)
  })

  it('H-5: rejects empty session id', () => {
    const derive = createDeriveSessionAccessHash('test-secret')
    expect(() => derive('   ')).toThrow(/sessionId/i)
  })
})
