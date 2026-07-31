import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as enrichmentPersistentModule from './fertilizerEnrichmentJobRepositoryPersistentCore'
import * as sessionHashModule from './fertilizerEnrichmentSessionAccessHashCore'
import * as productProfilePersistentModule from './fertilizerProductProfileRepositoryMappingCore'
import type { FertilizerEnrichmentServerEnvironment } from './fertilizerEnrichmentServerEnvironmentCore'
import { createFertilizerProductProfileSaveServerRuntime } from './fertilizerProductProfileSaveCompositionCore'

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

describe('fertilizerProductProfileSaveCompositionCore', () => {
  it('wires enrichment and product profile repositories', () => {
    const supabase = { from: vi.fn() } as unknown as SupabaseClient
    const enrichmentSpy = vi.spyOn(
      enrichmentPersistentModule,
      'createPersistentFertilizerEnrichmentJobRepository',
    )
    const productProfileSpy = vi.spyOn(
      productProfilePersistentModule,
      'createPersistentFertilizerProductProfileRepository',
    )

    const runtime = createFertilizerProductProfileSaveServerRuntime({
      environment: TEST_ENVIRONMENT,
      supabase,
      authValidator: { validateBearerToken: async () => 'user-1' },
    })

    expect(runtime.isCompositionEnabled()).toBe(true)
    expect(enrichmentSpy).toHaveBeenCalledWith({
      supabase,
      deriveSessionAccessHash: expect.any(Function),
    })
    expect(productProfileSpy).toHaveBeenCalledWith({
      supabase,
      deriveSessionAccessHash: expect.any(Function),
    })
    expect(runtime.handlers).toBeDefined()

    enrichmentSpy.mockRestore()
    productProfileSpy.mockRestore()
  })

  it('uses injected HMAC secret for session access hash derivation', () => {
    const hashSpy = vi.spyOn(sessionHashModule, 'createDeriveSessionAccessHash')

    createFertilizerProductProfileSaveServerRuntime({
      environment: TEST_ENVIRONMENT,
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    expect(hashSpy).toHaveBeenCalledWith('composition-hmac-secret')
    hashSpy.mockRestore()
  })
})
