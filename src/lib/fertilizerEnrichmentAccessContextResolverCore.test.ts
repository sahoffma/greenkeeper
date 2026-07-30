import { describe, expect, it } from 'vitest'
import {
  assertNoClientAccessContextFields,
  buildFertilizerEnrichmentRequestContext,
  FERTILIZER_ENRICHMENT_SESSION_ID_HEADER,
  resolveFertilizerEnrichmentAccessContext,
  resolveFertilizerEnrichmentServerContexts,
} from './fertilizerEnrichmentAccessContextResolverCore'
import { FertilizerEnrichmentServerApiError } from './fertilizerEnrichmentServerServiceCore'
import { createFertilizerEnrichmentSessionCookieManager } from './fertilizerEnrichmentSessionCookieCore'

const authValidator = {
  validateBearerToken: async (token: string) => (token === 'valid-token' ? 'user-123' : null),
}

const sessionCookieManager = createFertilizerEnrichmentSessionCookieManager('cookie-signing-secret', {
  maxAgeSeconds: 3600,
  secure: false,
})

function resolverDependencies() {
  return {
    authValidator,
    sessionCookieManager,
  }
}

describe('fertilizerEnrichmentAccessContextResolverCore', () => {
  it('ACX-1: authenticated request resolves validated user access context and ignores session cookie', async () => {
    const issued = sessionCookieManager.issueSession()
    const accessContext = await resolveFertilizerEnrichmentAccessContext(
      {
        authorization: 'Bearer valid-token',
        cookie: issued.setCookieHeader.split(';')[0],
      },
      resolverDependencies(),
    )

    expect(accessContext).toEqual({
      kind: 'authenticated_user',
      userId: 'user-123',
      sessionId: null,
    })

    const requestContext = buildFertilizerEnrichmentRequestContext(accessContext, {
      ...resolverDependencies(),
      createRequestId: () => 'req-auth',
    })

    expect(requestContext.userId).toBe('user-123')
    expect(requestContext.sessionId).toBeNull()
  })

  it('ACX-2: valid anonymous session cookie resolves session access context', async () => {
    const issued = sessionCookieManager.issueSession()
    const resolved = await resolveFertilizerEnrichmentServerContexts(
      { cookie: issued.setCookieHeader.split(';')[0] },
      resolverDependencies(),
    )

    expect(resolved.accessContext).toEqual({
      kind: 'session',
      sessionId: issued.sessionId,
    })
    expect(resolved.setCookieHeader).toBeUndefined()
  })

  it('ACX-3: missing cookie issues new secure session with Set-Cookie metadata', async () => {
    const resolved = await resolveFertilizerEnrichmentServerContexts({}, resolverDependencies())

    expect(resolved.accessContext.kind).toBe('session')
    expect(resolved.accessContext).toMatchObject({
      sessionId: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(resolved.setCookieHeader).toContain('HttpOnly')
    expect(resolved.setCookieHeader).toContain('SameSite=Lax')
  })

  it('ACX-4: manipulated cookie does not produce access context from manipulated value', async () => {
    const issued = sessionCookieManager.issueSession()
    const cookieValue = issued.setCookieHeader.split('=')[1]?.split(';')[0] ?? ''
    const parts = cookieValue.split('.')
    parts[1] = 'c'.repeat(64)
    const manipulatedCookie = `${parts.join('.')}`

    const resolved = await resolveFertilizerEnrichmentServerContexts(
      { cookie: `gk_fe_session=${manipulatedCookie}` },
      resolverDependencies(),
    )

    expect(resolved.accessContext.sessionId).not.toBe('c'.repeat(64))
    expect(resolved.setCookieHeader).toBeDefined()
  })

  it('ACX-5: legacy session header is rejected and never determines access context', async () => {
    await expect(
      resolveFertilizerEnrichmentAccessContext(
        { [FERTILIZER_ENRICHMENT_SESSION_ID_HEADER]: 'forged-session' },
        resolverDependencies(),
      ),
    ).rejects.toMatchObject({
      apiError: { code: 'invalid_request' },
      httpStatus: 400,
    })
  })

  it('ACX-6: forged session body fields are rejected', () => {
    expect(() => assertNoClientAccessContextFields({ sessionId: 'fake-session' })).toThrow(
      FertilizerEnrichmentServerApiError,
    )
  })

  it('ACX-7: authenticated access context takes precedence over session cookie', async () => {
    const issued = sessionCookieManager.issueSession()
    const accessContext = await resolveFertilizerEnrichmentAccessContext(
      {
        authorization: 'Bearer valid-token',
        cookie: issued.setCookieHeader.split(';')[0],
      },
      resolverDependencies(),
    )

    expect(accessContext.kind).toBe('authenticated_user')
    expect(accessContext).toMatchObject({ userId: 'user-123' })
  })

  it('ACX-8: invalid auth returns controlled unauthorized error without header fallback', async () => {
    await expect(
      resolveFertilizerEnrichmentAccessContext(
        {
          authorization: 'Bearer invalid-token',
        },
        resolverDependencies(),
      ),
    ).rejects.toMatchObject({
      apiError: { code: 'unauthorized' },
      httpStatus: 401,
    })
  })
})
