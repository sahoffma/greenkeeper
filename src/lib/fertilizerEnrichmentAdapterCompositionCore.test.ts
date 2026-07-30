import { describe, expect, it } from 'vitest'
import { createFertilizerEnrichmentOrchestrationDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import { FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE } from './fertilizerManufacturerProductDocumentAdapterCore'
import { FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE } from './fertilizerUserDocumentAdapterCore'
import { FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE } from './fertilizerPackagingSourceAdapterCore'
import { createFertilizerEnrichmentServerRuntime } from './fertilizerEnrichmentServerCompositionCore'
import type { FertilizerEnrichmentServerEnvironment } from './fertilizerEnrichmentServerEnvironmentCore'
import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'

const TEST_ENVIRONMENT: FertilizerEnrichmentServerEnvironment = {
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
}

describe('fertilizerEnrichmentAdapterCompositionCore', () => {
  it('AR-1: placeholder resolvers are not registered in production composition', () => {
    const dependencies = createFertilizerEnrichmentOrchestrationDependencies()
    expect(dependencies.adapters).toHaveLength(0)
  })

  it('AR-2: supported adapter types register only when real resolver is provided', () => {
    const dependencies = createFertilizerEnrichmentOrchestrationDependencies({
      resolveUserDocumentSource: async () => ({
        ok: true,
        referenceId: 'doc-1',
        contentType: 'text/plain',
        text: 'N 15',
        providedAt: '2026-07-29T10:00:00.000Z',
        mediaKind: 'text',
      }),
    })

    expect(dependencies.adapters).toHaveLength(1)
    expect(dependencies.adapters[0]?.adapterType).toBe(FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE)
  })

  it('AR-3: unregistered adapter types are absent from production adapter list', () => {
    const dependencies = createFertilizerEnrichmentOrchestrationDependencies()
    const adapterTypes = dependencies.adapters.map((adapter) => adapter.adapterType)

    expect(adapterTypes).not.toContain(FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE)
    expect(adapterTypes).not.toContain(FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE)
    expect(adapterTypes).not.toContain(FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE)
  })

  it('AR-4: runtime creation remains valid without productive source adapters', () => {
    const runtime = createFertilizerEnrichmentServerRuntime({
      environment: TEST_ENVIRONMENT,
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    expect(runtime.isCompositionEnabled()).toBe(true)
    expect(runtime.handlers.handleStart).toBeTypeOf('function')
  })

  it('AR-5: production runtime does not register placeholder adapters implicitly', () => {
    const dependencies = createFertilizerEnrichmentOrchestrationDependencies()
    expect(dependencies.adapters).toHaveLength(0)
  })
})
