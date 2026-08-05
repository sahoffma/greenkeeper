import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as persistentRepositoryModule from './fertilizerEnrichmentJobRepositoryPersistentCore'
import * as adapterCompositionModule from './fertilizerEnrichmentAdapterCompositionCore'
import * as sessionHashModule from './fertilizerEnrichmentSessionAccessHashCore'
import {
  createFertilizerEnrichmentServerRuntime,
  createSupabaseAuthValidator,
} from './fertilizerEnrichmentServerCompositionCore'
import type { FertilizerEnrichmentServerEnvironment } from './fertilizerEnrichmentServerEnvironmentCore'

function createTestEnvironment(
  overrides: Partial<FertilizerEnrichmentServerEnvironment> = {},
): FertilizerEnrichmentServerEnvironment {
  return {
    supabaseUrl: 'https://example.supabase.co',
    supabaseServiceRoleKey: 'service-role-key',
    sessionAccessHmacSecret: 'composition-hmac-secret',
    sessionCookieSigningSecret: 'composition-cookie-secret',
    sessionCookieSecure: false,
    sessionMaxAgeSeconds: 72 * 3600,
    retention: {
      continuableDays: 7,
      sessionMaxHours: 72,
      terminalDays: 30,
      intakeReadyDays: 14,
    },
    ...overrides,
  }
}

const TEST_ENVIRONMENT = createTestEnvironment()

describe('fertilizerEnrichmentServerCompositionCore', () => {
  it('EC-1: runtime factory wires persistent repository and enables composition', () => {
    const supabase = { from: vi.fn() } as unknown as SupabaseClient
    const persistentSpy = vi.spyOn(
      persistentRepositoryModule,
      'createPersistentFertilizerEnrichmentJobRepository',
    )

    const runtime = createFertilizerEnrichmentServerRuntime({
      environment: TEST_ENVIRONMENT,
      supabase,
      authValidator: { validateBearerToken: async () => 'user-1' },
    })

    expect(runtime.isCompositionEnabled()).toBe(true)
    expect(persistentSpy).toHaveBeenCalledWith({
      supabase,
      deriveSessionAccessHash: expect.any(Function),
    })
    expect(runtime.handlers).toBeDefined()

    persistentSpy.mockRestore()
  })

  it('RC-2: HMAC deriver receives only injected secret', () => {
    const hashSpy = vi.spyOn(sessionHashModule, 'createDeriveSessionAccessHash')

    createFertilizerEnrichmentServerRuntime({
      environment: TEST_ENVIRONMENT,
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    expect(hashSpy).toHaveBeenCalledWith('composition-hmac-secret')
    hashSpy.mockRestore()
  })

  it('RC-5: production runtime wires persistent repository factory', () => {
    const persistentSpy = vi.spyOn(
      persistentRepositoryModule,
      'createPersistentFertilizerEnrichmentJobRepository',
    )

    createFertilizerEnrichmentServerRuntime({
      environment: TEST_ENVIRONMENT,
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    expect(persistentSpy).toHaveBeenCalledTimes(1)
    persistentSpy.mockRestore()
  })

  it('AR-5: production runtime wires orchestration with production source adapters without storage bucket', () => {
    const adapterSpy = vi.spyOn(
      adapterCompositionModule,
      'createFertilizerEnrichmentOrchestrationDependencies',
    )

    createFertilizerEnrichmentServerRuntime({
      environment: TEST_ENVIRONMENT,
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    expect(adapterSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchManufacturerDocument: expect.any(Function),
        resolvePackagingSource: expect.any(Function),
        resolveUserDocumentSource: expect.any(Function),
      }),
    )
    expect(adapterSpy.mock.results[0]?.value.adapters.length).toBeGreaterThan(0)
    adapterSpy.mockRestore()
  })

  it('RC-6: runtime exposes production HTTP handlers only', () => {
    const runtime = createFertilizerEnrichmentServerRuntime({
      environment: TEST_ENVIRONMENT,
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    expect(runtime.handlers.handleStart).toBeTypeOf('function')
    expect(runtime.handlers.handleStatus).toBeTypeOf('function')
    expect(runtime.handlers.handleAdditionalSource).toBeTypeOf('function')
    expect(runtime.handlers.handleCancel).toBeTypeOf('function')
  })

  it('createSupabaseAuthValidator returns null for invalid token', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'invalid' } })),
      },
    } as unknown as SupabaseClient

    const validator = createSupabaseAuthValidator(supabase)
    await expect(validator.validateBearerToken('bad-token')).resolves.toBeNull()
  })

  it('COMP-1: cookie max age is derived from environment session max hours', async () => {
    const runtime = createFertilizerEnrichmentServerRuntime({
      environment: createTestEnvironment({
        sessionMaxAgeSeconds: 18000,
        retention: {
          continuableDays: 7,
          sessionMaxHours: 5,
          terminalDays: 30,
          intakeReadyDays: 14,
        },
      }),
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    const response = await runtime.handlers.handleStart({
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

    expect(response.headers['Set-Cookie']).toContain('Max-Age=18000')
    expect(response.headers['Set-Cookie']).not.toContain('Max-Age=259200')
  })

  it('COMP-2: secure session cookies are injected when environment requires them', async () => {
    const runtime = createFertilizerEnrichmentServerRuntime({
      environment: createTestEnvironment({ sessionCookieSecure: true }),
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    const response = await runtime.handlers.handleStart({
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

    expect(response.headers['Set-Cookie']).toContain('Secure')
  })

  it('COMP-3: secure false omits Secure attribute from session cookie', async () => {
    const runtime = createFertilizerEnrichmentServerRuntime({
      environment: createTestEnvironment({ sessionCookieSecure: false }),
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    const response = await runtime.handlers.handleStart({
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

    expect(response.headers['Set-Cookie']).not.toContain('Secure')
  })

  it('COMP-4: non-default session max hours keeps runtime functional', async () => {
    const runtime = createFertilizerEnrichmentServerRuntime({
      environment: createTestEnvironment({
        sessionMaxAgeSeconds: 7200,
        retention: {
          continuableDays: 7,
          sessionMaxHours: 2,
          terminalDays: 30,
          intakeReadyDays: 14,
        },
      }),
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    const response = await runtime.handlers.handleStart({
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

    expect(runtime.isCompositionEnabled()).toBe(true)
    expect(response.headers['Set-Cookie']).toContain('Max-Age=7200')
    expect(response.statusCode).not.toBe(500)
  })
})
