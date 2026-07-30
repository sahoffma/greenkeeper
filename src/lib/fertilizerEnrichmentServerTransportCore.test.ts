import { describe, expect, it, vi } from 'vitest'
import { FERTILIZER_ENRICHMENT_SESSION_ID_HEADER } from './fertilizerEnrichmentAccessContextResolverCore'
import { createFertilizerEnrichmentProductionHttpHandlers } from './fertilizerEnrichmentServerTransportCore'
import { FertilizerEnrichmentServerApiError } from './fertilizerEnrichmentServerServiceCore'
import { createFertilizerEnrichmentSessionCookieManager } from './fertilizerEnrichmentSessionCookieCore'

const sessionCookieManager = createFertilizerEnrichmentSessionCookieManager('cookie-signing-secret', {
  maxAgeSeconds: 3600,
  secure: false,
})

function resolverDependencies(authUserId: string | null = null) {
  return {
    authValidator: {
      validateBearerToken: async (token: string) =>
        token === 'valid-token' ? authUserId ?? 'user-42' : null,
    },
    sessionCookieManager,
  }
}

describe('fertilizerEnrichmentServerTransportCore', () => {
  it('rejects forged accessContext in request body before service invocation', async () => {
    const service = {
      startFertilizerEnrichment: vi.fn(),
      getFertilizerEnrichmentStatus: vi.fn(),
      provideAdditionalFertilizerEnrichmentSource: vi.fn(),
      cancelFertilizerEnrichment: vi.fn(),
    }

    const handlers = createFertilizerEnrichmentProductionHttpHandlers({
      service,
      accessContextResolver: resolverDependencies(),
    })

    const response = await handlers.handleStart({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        idempotencyKey: 'idem-1',
        input: {},
        accessContext: { kind: 'session', sessionId: 'forged' },
      }),
    })

    expect(response.statusCode).toBe(400)
    expect(service.startFertilizerEnrichment).not.toHaveBeenCalled()
  })

  it('TC-1: new anonymous session returns secure Set-Cookie and no session id in body', async () => {
    const handlers = createFertilizerEnrichmentProductionHttpHandlers({
      service: {
        startFertilizerEnrichment: vi.fn(async () => {
          throw new FertilizerEnrichmentServerApiError(
            { code: 'invalid_request', message: 'validation stopped in test' },
            400,
          )
        }),
        getFertilizerEnrichmentStatus: vi.fn(),
        provideAdditionalFertilizerEnrichmentSource: vi.fn(),
        cancelFertilizerEnrichment: vi.fn(),
      },
      accessContextResolver: resolverDependencies(),
    })

    const response = await handlers.handleStart({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        idempotencyKey: 'idem-1',
        input: {
          objectCategory: 'fertilizer',
          identity: {
            manufacturer: 'ICL',
            officialName: 'Spring Start',
            identityFingerprint: 'fp-1',
            identityConfidence: 1,
            hasIdentityAmbiguity: false,
          },
          allowedInputChannels: ['capture_flow'],
        },
      }),
    })

    expect(response.headers['Set-Cookie']).toContain('HttpOnly')
    expect(response.headers['Set-Cookie']).toContain('SameSite=Lax')
    expect(JSON.stringify(JSON.parse(response.body))).not.toMatch(/[0-9a-f]{64}/)
  })

  it('TC-2: existing valid cookie is reused without issuing a new cookie', async () => {
    const issued = sessionCookieManager.issueSession()
    const service = {
      startFertilizerEnrichment: vi.fn(),
      getFertilizerEnrichmentStatus: vi.fn(),
      provideAdditionalFertilizerEnrichmentSource: vi.fn(),
      cancelFertilizerEnrichment: vi.fn(),
    }

    const handlers = createFertilizerEnrichmentProductionHttpHandlers({
      service,
      accessContextResolver: resolverDependencies(),
    })

    await handlers.handleStart({
      httpMethod: 'POST',
      headers: { cookie: issued.setCookieHeader.split(';')[0] },
      body: JSON.stringify({ idempotencyKey: 'idem-1', input: {} }),
    })

    expect(service.startFertilizerEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({
        accessContext: { kind: 'session', sessionId: issued.sessionId },
      }),
      expect.objectContaining({ sessionId: issued.sessionId }),
    )
  })

  it('TC-3: authenticated request does not require anonymous session cookie', async () => {
    const service = {
      startFertilizerEnrichment: vi.fn(),
      getFertilizerEnrichmentStatus: vi.fn(),
      provideAdditionalFertilizerEnrichmentSource: vi.fn(),
      cancelFertilizerEnrichment: vi.fn(),
    }

    const handlers = createFertilizerEnrichmentProductionHttpHandlers({
      service,
      accessContextResolver: resolverDependencies('user-42'),
    })

    const response = await handlers.handleStart({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: JSON.stringify({ idempotencyKey: 'idem-1', input: {} }),
    })

    expect(response.headers['Set-Cookie']).toBeUndefined()
    expect(service.startFertilizerEnrichment).toHaveBeenCalled()
  })

  it('rejects legacy insecure session header', async () => {
    const handlers = createFertilizerEnrichmentProductionHttpHandlers({
      service: {
        startFertilizerEnrichment: vi.fn(),
        getFertilizerEnrichmentStatus: vi.fn(),
        provideAdditionalFertilizerEnrichmentSource: vi.fn(),
        cancelFertilizerEnrichment: vi.fn(),
      },
      accessContextResolver: resolverDependencies(),
    })

    const response = await handlers.handleStart({
      httpMethod: 'POST',
      headers: { [FERTILIZER_ENRICHMENT_SESSION_ID_HEADER]: 'forged-session' },
      body: JSON.stringify({ idempotencyKey: 'idem-1', input: {} }),
    })

    expect(response.statusCode).toBe(400)
  })

  it('maps invalid JSON to controlled invalid_request error', async () => {
    const handlers = createFertilizerEnrichmentProductionHttpHandlers({
      service: {
        startFertilizerEnrichment: vi.fn(),
        getFertilizerEnrichmentStatus: vi.fn(),
        provideAdditionalFertilizerEnrichmentSource: vi.fn(),
        cancelFertilizerEnrichment: vi.fn(),
      },
      accessContextResolver: resolverDependencies('user-1'),
    })

    const response = await handlers.handleStart({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: '{invalid',
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error.code).toBe('invalid_request')
  })

  it('serializes service errors without internal leakage', async () => {
    const handlers = createFertilizerEnrichmentProductionHttpHandlers({
      service: {
        startFertilizerEnrichment: vi.fn(async () => {
          throw new FertilizerEnrichmentServerApiError(
            { code: 'revision_conflict', message: 'Enrichment job was updated concurrently.' },
            409,
          )
        }),
        getFertilizerEnrichmentStatus: vi.fn(),
        provideAdditionalFertilizerEnrichmentSource: vi.fn(),
        cancelFertilizerEnrichment: vi.fn(),
      },
      accessContextResolver: {
        ...resolverDependencies('user-1'),
        createRequestId: () => 'req-1',
      },
    })

    const response = await handlers.handleStart({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: JSON.stringify({
        idempotencyKey: 'idem-1',
        input: {
          objectCategory: 'fertilizer',
          identity: {
            manufacturer: 'ICL',
            officialName: 'Spring Start',
            identityFingerprint: 'fp-1',
            identityConfidence: 1,
            hasIdentityAmbiguity: false,
          },
          allowedInputChannels: ['capture_flow'],
        },
      }),
    })

    expect(response.statusCode).toBe(409)
    expect(JSON.stringify(response.body)).not.toContain('recordSchemaVersion')
    expect(JSON.stringify(response.body)).not.toContain('orchestrationInput')
  })
})
