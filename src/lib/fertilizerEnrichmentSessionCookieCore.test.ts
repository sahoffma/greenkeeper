import { describe, expect, it } from 'vitest'
import {
  buildFertilizerEnrichmentSessionSetCookieHeader,
  createFertilizerEnrichmentSessionCookieManager,
  FERTILIZER_ENRICHMENT_SESSION_COOKIE_NAME,
  FERTILIZER_ENRICHMENT_SESSION_ID_BYTE_LENGTH,
  FertilizerEnrichmentSessionCookieError,
  generateFertilizerEnrichmentSessionId,
  validateFertilizerEnrichmentSessionCookieValue,
} from './fertilizerEnrichmentSessionCookieCore'

const SIGNING_SECRET = 'cookie-signing-secret'
const OTHER_SECRET = 'other-signing-secret'
const TEST_COOKIE_CONFIG = { maxAgeSeconds: 3600, secure: false }

describe('fertilizerEnrichmentSessionCookieCore', () => {
  it('SC-1: secure session generation uses expected entropy and does not leak secrets', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, TEST_COOKIE_CONFIG)
    const first = manager.issueSession()
    const second = manager.issueSession()

    expect(first.sessionId).toHaveLength(FERTILIZER_ENRICHMENT_SESSION_ID_BYTE_LENGTH * 2)
    expect(second.sessionId).toHaveLength(FERTILIZER_ENRICHMENT_SESSION_ID_BYTE_LENGTH * 2)
    expect(first.sessionId).not.toBe(second.sessionId)
    expect(first.setCookieHeader).toContain(`${FERTILIZER_ENRICHMENT_SESSION_COOKIE_NAME}=`)
    expect(first.setCookieHeader).not.toContain(SIGNING_SECRET)
    expect(generateFertilizerEnrichmentSessionId()).not.toBe(first.sessionId)
  })

  it('SC-2: valid cookie signature validates and reconstructs session id', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, TEST_COOKIE_CONFIG)
    const issued = manager.issueSession()
    const cookieValue = issued.setCookieHeader.split('=')[1]?.split(';')[0] ?? ''

    expect(validateFertilizerEnrichmentSessionCookieValue(cookieValue, SIGNING_SECRET)).toBe(
      issued.sessionId,
    )
  })

  it('SC-3: manipulated payload is rejected', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, TEST_COOKIE_CONFIG)
    const issued = manager.issueSession()
    const cookieValue = issued.setCookieHeader.split('=')[1]?.split(';')[0] ?? ''
    const parts = cookieValue.split('.')
    parts[1] = 'a'.repeat(64)
    const manipulated = parts.join('.')

    expect(validateFertilizerEnrichmentSessionCookieValue(manipulated, SIGNING_SECRET)).toBeNull()
  })

  it('SC-4: manipulated signature is rejected', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, TEST_COOKIE_CONFIG)
    const issued = manager.issueSession()
    const cookieValue = issued.setCookieHeader.split('=')[1]?.split(';')[0] ?? ''
    const parts = cookieValue.split('.')
    parts[2] = 'b'.repeat(64)
    const manipulated = parts.join('.')

    expect(validateFertilizerEnrichmentSessionCookieValue(manipulated, SIGNING_SECRET)).toBeNull()
  })

  it('SC-5: wrong secret rejects validation', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, TEST_COOKIE_CONFIG)
    const issued = manager.issueSession()
    const cookieValue = issued.setCookieHeader.split('=')[1]?.split(';')[0] ?? ''

    expect(validateFertilizerEnrichmentSessionCookieValue(cookieValue, OTHER_SECRET)).toBeNull()
  })

  it('SC-6: empty signing secret throws controlled configuration error', () => {
    expect(() => createFertilizerEnrichmentSessionCookieManager('   ', TEST_COOKIE_CONFIG)).toThrow(
      FertilizerEnrichmentSessionCookieError,
    )
  })

  it('SC-7: errors and cookie headers contain no session id or secret leakage', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, TEST_COOKIE_CONFIG)
    const issued = manager.issueSession()

    try {
      createFertilizerEnrichmentSessionCookieManager('', TEST_COOKIE_CONFIG)
    } catch (error) {
      expect(String(error)).not.toContain(issued.sessionId)
      expect(String(error)).not.toContain(SIGNING_SECRET)
    }

    const header = buildFertilizerEnrichmentSessionSetCookieHeader(issued.sessionId, SIGNING_SECRET, {
      maxAgeSeconds: 3600,
      secure: true,
    })

    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Secure')
    expect(header).not.toContain(SIGNING_SECRET)
  })

  it('CM-1: injected max age appears exactly in Set-Cookie header', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, {
      maxAgeSeconds: 3600,
      secure: false,
    })

    expect(manager.issueSession().setCookieHeader).toContain('Max-Age=3600')
  })

  it('CM-2: derived five-hour max age serializes as Max-Age=18000 without 259200', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, {
      maxAgeSeconds: 18000,
      secure: false,
    })

    const header = manager.issueSession().setCookieHeader
    expect(header).toContain('Max-Age=18000')
    expect(header).not.toContain('259200')
  })

  it('CM-3: secure true adds Secure attribute', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, {
      maxAgeSeconds: 3600,
      secure: true,
    })

    expect(manager.issueSession().setCookieHeader).toContain('Secure')
  })

  it('CM-4: secure false omits Secure attribute', () => {
    const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, {
      maxAgeSeconds: 3600,
      secure: false,
    })

    expect(manager.issueSession().setCookieHeader).not.toContain('Secure')
  })

  it('CM-5: cookie behavior depends only on injected options, not process.env', () => {
    const previousContext = process.env.CONTEXT
    process.env.CONTEXT = 'production'

    try {
      const manager = createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, {
        maxAgeSeconds: 3600,
        secure: false,
      })

      expect(manager.issueSession().setCookieHeader).not.toContain('Secure')
    } finally {
      if (previousContext === undefined) {
        delete process.env.CONTEXT
      } else {
        process.env.CONTEXT = previousContext
      }
    }
  })

  it('CM-6: invalid max age values are rejected without secret or session leakage', () => {
    const invalidValues = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]

    for (const maxAgeSeconds of invalidValues) {
      expect(() =>
        createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, {
          maxAgeSeconds,
          secure: false,
        }),
      ).toThrow(FertilizerEnrichmentSessionCookieError)

      try {
        createFertilizerEnrichmentSessionCookieManager(SIGNING_SECRET, {
          maxAgeSeconds,
          secure: false,
        })
      } catch (error) {
        expect(String(error)).not.toContain(SIGNING_SECRET)
        expect(String(error)).not.toContain('session')
      }
    }
  })
})
