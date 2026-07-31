import { describe, expect, it, vi } from 'vitest'
import { FERTILIZER_ENRICHMENT_SESSION_ID_HEADER } from './fertilizerEnrichmentAccessContextResolverCore'
import { createFertilizerEnrichmentSessionCookieManager } from './fertilizerEnrichmentSessionCookieCore'
import { FertilizerProductProfileSaveServerApiError } from './fertilizerProductProfileSaveServerServiceCore'
import type { FertilizerProductProfileSaveServerService } from './fertilizerProductProfileSaveServerServiceCore'
import { createFertilizerProductProfileSaveProductionHttpHandlers } from './fertilizerProductProfileSaveTransportCore'

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

describe('fertilizerProductProfileSaveTransportCore', () => {
  it('rejects forged accessContext before service invocation', async () => {
    const service = {
      saveFertilizerProductProfile: vi.fn(),
    }

    const handlers = createFertilizerProductProfileSaveProductionHttpHandlers({
      service,
      accessContextResolver: resolverDependencies(),
    })

    const response = await handlers.handleSave({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        enrichmentJobId: 'job-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-1',
        accessContext: { kind: 'session', sessionId: 'forged' },
      }),
    })

    expect(response.statusCode).toBe(400)
    expect(service.saveFertilizerProductProfile).not.toHaveBeenCalled()
  })

  it('rejects forbidden save payload fields before service invocation', async () => {
    const service = {
      saveFertilizerProductProfile: vi.fn(),
    }

    const handlers = createFertilizerProductProfileSaveProductionHttpHandlers({
      service,
      accessContextResolver: resolverDependencies(),
    })

    const response = await handlers.handleSave({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        enrichmentJobId: 'job-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-1',
        nutrientMatrix: { iron: { value: 1 } },
      }),
    })

    expect(response.statusCode).toBe(400)
    expect(service.saveFertilizerProductProfile).not.toHaveBeenCalled()
  })

  it('issues secure Set-Cookie for new anonymous session without session id in body', async () => {
    const handlers = createFertilizerProductProfileSaveProductionHttpHandlers({
      service: {
        saveFertilizerProductProfile: vi.fn(async () => {
          throw new FertilizerProductProfileSaveServerApiError(
            { code: 'invalid_request', message: 'validation stopped in test' },
            400,
          )
        }),
      },
      accessContextResolver: resolverDependencies(),
    })

    const response = await handlers.handleSave({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        enrichmentJobId: 'job-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-1',
      }),
    })

    expect(response.headers['Set-Cookie']).toContain('HttpOnly')
    expect(response.headers['Set-Cookie']).toContain('SameSite=Lax')
    expect(JSON.stringify(JSON.parse(response.body))).not.toMatch(/[0-9a-f]{64}/)
  })

  it('prefers authenticated access over anonymous session cookie', async () => {
    const saveFertilizerProductProfile = vi.fn(async () => ({
      profile: {
        id: 'profile-1',
        manufacturer: 'ICL',
        productLine: null,
        officialName: 'Spring Start',
        variant: null,
        productForm: 'granular' as const,
        npkDeclaration: '15-15-26',
        nitrogen: 15,
        phosphate: 15,
        potash: 26,
        nutrientMatrix: {},
        createdAt: '2026-07-31T10:00:00.000Z',
      },
      reusedExistingVersion: false,
    }))

    const handlers = createFertilizerProductProfileSaveProductionHttpHandlers({
      service: { saveFertilizerProductProfile } as FertilizerProductProfileSaveServerService,
      accessContextResolver: resolverDependencies('user-42'),
    })

    await handlers.handleSave({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: JSON.stringify({
        enrichmentJobId: 'job-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-1',
      }),
    })

    expect(saveFertilizerProductProfile).toHaveBeenCalledWith(
      expect.objectContaining({ enrichmentJobId: 'job-1' }),
      { kind: 'authenticated_user', userId: 'user-42', sessionId: null },
    )
  })

  it('rejects legacy insecure session header', async () => {
    const handlers = createFertilizerProductProfileSaveProductionHttpHandlers({
      service: { saveFertilizerProductProfile: vi.fn() },
      accessContextResolver: resolverDependencies(),
    })

    const response = await handlers.handleSave({
      httpMethod: 'POST',
      headers: { [FERTILIZER_ENRICHMENT_SESSION_ID_HEADER]: 'legacy-session' },
      body: JSON.stringify({
        enrichmentJobId: 'job-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-1',
      }),
    })

    expect(response.statusCode).toBe(400)
  })
})
