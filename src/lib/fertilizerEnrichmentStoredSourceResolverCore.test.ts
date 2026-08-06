import { describe, expect, it, vi } from 'vitest'
import type {
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentSourceHint,
} from '../types/fertilizerEnrichmentOrchestration'
import { runWithFertilizerEnrichmentSourceAccessScope } from './fertilizerEnrichmentSourceAccessScopeCore'
import {
  FertilizerEnrichmentSourceStorageError,
  type FertilizerEnrichmentSourceStorage,
  type FertilizerEnrichmentSourceStorageObject,
} from './fertilizerEnrichmentSourceStorageCore'
import { createFertilizerEnrichmentOrchestrationDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import { orchestrateFertilizerEnrichment } from './fertilizerEnrichmentOrchestrationCore'
import { createFertilizerEnrichmentStoredSourceAdapterDependencies } from './fertilizerEnrichmentStoredSourceResolverCore'
import { FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE } from './fertilizerManufacturerProductDocumentAdapterCore'
import { FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE } from './fertilizerUserDocumentAdapterCore'
import { FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE } from './fertilizerPackagingSourceAdapterCore'
import { createFertilizerEnrichmentServerRuntime } from './fertilizerEnrichmentServerCompositionCore'
import type { FertilizerEnrichmentServerEnvironment } from './fertilizerEnrichmentServerEnvironmentCore'
import type { SupabaseClient } from '@supabase/supabase-js'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const USER_ID = 'user-42'
const SESSION_HASH = 'a'.repeat(64)

function buildManufacturerDocumentText(npk = '15-0-26', packSize?: string): string {
  const lines = [
    'Manufacturer: ICL',
    'Product: Spring Start',
    'Product variant: 15-0-26',
    'Form: Granular',
    '',
    `NPK ${npk}`,
    'Declaration basis (N / P2O5 / K2O)',
    '',
    'Nutrient declaration (% by weight):',
    'Nitrogen (N): 15%',
    'Phosphate (P2O5): 0%',
    'Potash (K2O): 26%',
    'Magnesium (MgO): 2%',
    'Nitrate nitrogen: 5%',
    'Ammonium nitrogen: 5%',
    'Urea nitrogen: 5%',
    'Organic nitrogen: 0%',
    ...(packSize ? [`Pack size: ${packSize}`] : []),
    'Declaration section complete',
  ]
  return lines.join('\n')
}

function buildPackagingText(npk = '15-0-26', packSize?: string): string {
  return [
    'Product: Spring Start',
    'Product variant: 15-0-26',
    '',
    `NPK ${npk}`,
    'Declaration basis (N / P2O5 / K2O)',
    '',
    'Nutrient declaration (% by weight):',
    'Nitrogen (N): 15%',
    'Phosphate (P2O5): 0%',
    'Potash (K2O): 26%',
    ...(packSize ? [`Net weight: ${packSize}`] : []),
    'Declaration section complete',
  ].join('\n')
}

function createInMemoryStorage(
  objects: Record<string, { text: string; contentType?: string }>,
): FertilizerEnrichmentSourceStorage & {
  loadTextObject: ReturnType<typeof vi.fn>
} {
  const loadTextObject = vi.fn(async (objectPath: string): Promise<FertilizerEnrichmentSourceStorageObject> => {
    const entry = objects[objectPath]
    if (!entry) {
      throw new FertilizerEnrichmentSourceStorageError(
        'source_not_found',
        'Stored enrichment source was not found.',
        false,
      )
    }

    return {
      bucket: 'test-bucket',
      objectPath,
      contentType: entry.contentType ?? 'text/plain',
      size: new TextEncoder().encode(entry.text).byteLength,
      text: entry.text,
      bytes: new TextEncoder().encode(entry.text),
      etag: null,
    }
  })

  return { loadTextObject }
}

function buildIdentityInput(
  sourceHints: FertilizerEnrichmentSourceHint[],
): FertilizerEnrichmentOrchestrationInput {
  return {
    objectCategory: 'fertilizer',
    identity: {
      manufacturer: 'ICL',
      officialName: 'Spring Start',
      productLine: 'Professional',
      variant: '15-0-26',
      identityFingerprint: 'icl-spring-start-15-0-26',
      identityConfidence: 0.95,
      hasIdentityAmbiguity: false,
    },
    allowedInputChannels: ['capture_flow'],
    sourceHints,
  }
}

const RESOLVER_CONTEXT = {
  input: buildIdentityInput([]),
  orchestrationRunId: 'orch-resolver-test',
  attempt: 1,
}

describe('fertilizerEnrichmentStoredSourceResolverCore', () => {
  it('MD-1: stored manufacturer text document is loaded and normalized', async () => {
    const storage = createInMemoryStorage({
      'manufacturer/sources/stress-doc-1': {
        text: buildManufacturerDocumentText(),
      },
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage, {
      now: () => FIXED_NOW,
    })

    const result = await deps.fetchManufacturerDocument!('stress-doc-1', RESOLVER_CONTEXT)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.contentType).toBe('text/plain')
      expect(result.text).toContain('NPK 15-0-26')
    }
    expect(storage.loadTextObject).toHaveBeenCalledWith('manufacturer/sources/stress-doc-1')
  })

  it('MD-2: external manufacturer URL is rejected without storage access', async () => {
    const storage = createInMemoryStorage({})
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const result = await deps.fetchManufacturerDocument!(
      'https://manufacturer.example/doc.txt',
      RESOLVER_CONTEXT,
    )
    expect(result).toEqual({
      ok: false,
      errorCode: 'unsupported_source',
      retryable: false,
    })
    expect(storage.loadTextObject).not.toHaveBeenCalled()
  })

  it('MD-3: missing manufacturer source maps to source_not_found', async () => {
    const storage = createInMemoryStorage({})
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const result = await deps.fetchManufacturerDocument!('missing-doc', RESOLVER_CONTEXT)
    expect(result).toEqual({
      ok: false,
      errorCode: 'source_not_found',
      retryable: false,
    })
  })

  it('MD-4: oversized manufacturer source does not succeed', async () => {
    const storage = createInMemoryStorage({})
    storage.loadTextObject.mockRejectedValueOnce(
      new FertilizerEnrichmentSourceStorageError(
        'invalid_document',
        'Stored enrichment source exceeds the configured size limit.',
        false,
      ),
    )
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const result = await deps.fetchManufacturerDocument!('large-doc', RESOLVER_CONTEXT)
    expect(result.ok).toBe(false)
  })

  it('MD-6: different pack sizes do not change normalized declaration values', async () => {
    const storage = createInMemoryStorage({
      'manufacturer/sources/pack-4kg': { text: buildManufacturerDocumentText('15-0-26', '4 kg') },
      'manufacturer/sources/pack-20kg': { text: buildManufacturerDocumentText('15-0-26', '20 kg') },
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage, {
      now: () => FIXED_NOW,
    })

    const fourKg = await deps.fetchManufacturerDocument!('pack-4kg', RESOLVER_CONTEXT)
    const twentyKg = await deps.fetchManufacturerDocument!('pack-20kg', RESOLVER_CONTEXT)

    expect(fourKg.ok && twentyKg.ok).toBe(true)
    if (fourKg.ok && twentyKg.ok) {
      expect(fourKg.text).toContain('Pack size: 4 kg')
      expect(twentyKg.text).toContain('Pack size: 20 kg')
      expect(fourKg.text).toContain('NPK 15-0-26')
      expect(twentyKg.text).toContain('NPK 15-0-26')
    }
  })

  it('OW-1/UD-1: authenticated user can load own text document', async () => {
    const storage = createInMemoryStorage({
      [`users/${USER_ID}/sources/upload-doc-001`]: {
        text: buildManufacturerDocumentText(),
      },
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage, {
      now: () => FIXED_NOW,
    })

    const result = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'authenticated_user', userId: USER_ID },
      () =>
        deps.resolveUserDocumentSource!(
          {
            adapterType: 'user_document',
            referenceId: 'upload-doc-001',
          },
          RESOLVER_CONTEXT,
        ),
    )

    expect(result.ok).toBe(true)
    expect(storage.loadTextObject).toHaveBeenCalledWith(`users/${USER_ID}/sources/upload-doc-001`)
  })

  it('OW-2: authenticated user cannot load foreign document path', async () => {
    const storage = createInMemoryStorage({
      'users/other-user/sources/upload-doc-001': {
        text: buildManufacturerDocumentText(),
      },
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const result = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'authenticated_user', userId: USER_ID },
      () =>
        deps.resolveUserDocumentSource!(
          {
            adapterType: 'user_document',
            referenceId: 'upload-doc-001',
          },
          RESOLVER_CONTEXT,
        ),
    )

    expect(result).toEqual({
      ok: false,
      errorCode: 'source_not_found',
      retryable: false,
    })
    expect(storage.loadTextObject).toHaveBeenCalledWith(`users/${USER_ID}/sources/upload-doc-001`)
  })

  it('OW-3/OW-4: session scope allows own path and rejects foreign session path', async () => {
    const locator = `gk-storage:v1/sessions/${SESSION_HASH}/sources/session-doc-1`
    const storage = createInMemoryStorage({
      [`sessions/${SESSION_HASH}/sources/session-doc-1`]: {
        text: buildManufacturerDocumentText(),
      },
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const allowed = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'session', sessionAccessHash: SESSION_HASH },
      () =>
        deps.resolveUserDocumentSource!(
          {
            adapterType: 'user_document',
            referenceId: locator,
          },
          RESOLVER_CONTEXT,
        ),
    )
    expect(allowed.ok).toBe(true)

    const denied = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'session', sessionAccessHash: 'b'.repeat(64) },
      () =>
        deps.resolveUserDocumentSource!(
          {
            adapterType: 'user_document',
            referenceId: locator,
          },
          RESOLVER_CONTEXT,
        ),
    )
    expect(denied).toEqual({
      ok: false,
      errorCode: 'unsupported_source',
      retryable: false,
    })
    expect(storage.loadTextObject).toHaveBeenCalledTimes(1)
  })

  it('OW-5/UD-5: forged user id in hint is not trusted for ownership', async () => {
    const storage = createInMemoryStorage({
      'users/forged-user/sources/upload-doc-001': {
        text: buildManufacturerDocumentText(),
      },
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const result = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'authenticated_user', userId: USER_ID },
      () =>
        deps.resolveUserDocumentSource!(
          {
            adapterType: 'user_document',
            sourceUrl: 'gk-storage:v1/users/forged-user/sources/upload-doc-001',
          },
          RESOLVER_CONTEXT,
        ),
    )

    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain(USER_ID)
    expect(JSON.stringify(result)).not.toContain('forged-user')
  })

  it('UD-3: unsupported MIME type is rejected for user documents', async () => {
    const storage = createInMemoryStorage({
      [`users/${USER_ID}/sources/pdf-doc`]: {
        text: '%PDF',
        contentType: 'application/pdf',
      },
    })
    storage.loadTextObject.mockImplementation(async () => {
      throw new FertilizerEnrichmentSourceStorageError(
        'unsupported_source',
        'Stored enrichment source content type is not supported.',
        false,
      )
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const result = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'authenticated_user', userId: USER_ID },
      () =>
        deps.resolveUserDocumentSource!(
          {
            adapterType: 'user_document',
            referenceId: 'pdf-doc',
          },
          RESOLVER_CONTEXT,
        ),
    )

    expect(result).toEqual({
      ok: false,
      errorCode: 'unsupported_source',
      retryable: false,
    })
  })

  it('UD-4: empty text is rejected', async () => {
    const storage = createInMemoryStorage({
      [`users/${USER_ID}/sources/empty-doc`]: { text: '   ' },
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const result = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'authenticated_user', userId: USER_ID },
      () =>
        deps.resolveUserDocumentSource!(
          {
            adapterType: 'user_document',
            referenceId: 'empty-doc',
          },
          RESOLVER_CONTEXT,
        ),
    )

    expect(result).toEqual({
      ok: false,
      errorCode: 'invalid_document',
      retryable: false,
    })
  })

  it('PK-1: packaging label text is loaded from storage and remains text-only', async () => {
    const storage = createInMemoryStorage({
      [`users/${USER_ID}/sources/pack-label-1`]: {
        text: buildPackagingText(),
      },
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage, {
      now: () => FIXED_NOW,
    })

    const result = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'authenticated_user', userId: USER_ID },
      () =>
        deps.resolvePackagingSource!(
          {
            adapterType: 'packaging',
            referenceId: 'pack-label-1',
          },
          RESOLVER_CONTEXT,
        ),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.contentType).toBe('text/plain')
      expect(result.text).toContain('NPK 15-0-26')
    }
  })

  it('PK-2: packaging image bytes are not productively resolved', async () => {
    const storage = createInMemoryStorage({
      [`users/${USER_ID}/sources/pack-image-1`]: {
        text: 'binary-image-placeholder',
        contentType: 'image/jpeg',
      },
    })
    storage.loadTextObject.mockImplementation(async () => {
      throw new FertilizerEnrichmentSourceStorageError(
        'unsupported_source',
        'Stored enrichment source content type is not supported.',
        false,
      )
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const result = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'authenticated_user', userId: USER_ID },
      () =>
        deps.resolvePackagingSource!(
          {
            adapterType: 'packaging',
            referenceId: 'pack-image-1',
          },
          RESOLVER_CONTEXT,
        ),
    )

    expect(result.ok).toBe(false)
  })

  it('PK-3/PK-4: pack size metadata does not override differing nutrient declarations', async () => {
    const storage = createInMemoryStorage({
      [`users/${USER_ID}/sources/pack-a`]: { text: buildPackagingText('14-0-20', '5 kg') },
      [`users/${USER_ID}/sources/pack-b`]: { text: buildPackagingText('16-0-28', '20 kg') },
    })
    const deps = createFertilizerEnrichmentStoredSourceAdapterDependencies(storage)

    const a = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'authenticated_user', userId: USER_ID },
      () =>
        deps.resolvePackagingSource!(
          { adapterType: 'packaging', referenceId: 'pack-a' },
          RESOLVER_CONTEXT,
        ),
    )
    const b = await runWithFertilizerEnrichmentSourceAccessScope(
      { kind: 'authenticated_user', userId: USER_ID },
      () =>
        deps.resolvePackagingSource!(
          { adapterType: 'packaging', referenceId: 'pack-b' },
          RESOLVER_CONTEXT,
        ),
    )

    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) {
      expect(a.text).toContain('NPK 14-0-20')
      expect(b.text).toContain('NPK 16-0-28')
    }
  })

  it('ARF-1/ARF-4: production composition registers only real stored-source adapters when configured', () => {
    const storage = createInMemoryStorage({
      'manufacturer/sources/doc-1': { text: buildManufacturerDocumentText() },
    })
    const dependencies = createFertilizerEnrichmentOrchestrationDependencies(
      createFertilizerEnrichmentStoredSourceAdapterDependencies(storage),
    )

    expect(dependencies.adapters).toHaveLength(4)
    expect(dependencies.adapters.map((adapter) => adapter.adapterType)).toEqual([
      FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
      'manufacturer_product_page',
      FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
      FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
    ])
  })

  it('ARF-2/ARF-5: missing storage source cannot appear as enrichment success', async () => {
    const storage = createInMemoryStorage({})
    const dependencies = createFertilizerEnrichmentOrchestrationDependencies(
      createFertilizerEnrichmentStoredSourceAdapterDependencies(storage),
    )

    const result = await orchestrateFertilizerEnrichment(
      buildIdentityInput([
        {
          adapterType: 'manufacturer_product_document',
          referenceId: 'missing-doc',
        },
      ]),
      dependencies,
    )

    expect(result.successfulAdapters).not.toContain('manufacturer_product_document')
    expect(result.status).not.toBe('recognized')
  })

  it('E2E-1: stored manufacturer text flows through orchestration without persistence side effects', async () => {
    const storage = createInMemoryStorage({
      'manufacturer/sources/e2e-doc': { text: buildManufacturerDocumentText() },
    })
    const dependencies = createFertilizerEnrichmentOrchestrationDependencies(
      createFertilizerEnrichmentStoredSourceAdapterDependencies(storage, {
        now: () => FIXED_NOW,
      }),
    )

    const result = await orchestrateFertilizerEnrichment(
      buildIdentityInput([
        {
          adapterType: 'manufacturer_product_document',
          referenceId: 'e2e-doc',
        },
      ]),
      dependencies,
      {
        normalizedAt: FIXED_NOW,
        evaluatedAt: FIXED_NOW,
        normalizationRunId: 'norm-e2e',
      },
    )

    expect(result.successfulAdapters).toContain('manufacturer_product_document')
    expect(result.rawDeclarationInput?.nutrientMatrix?.nitrogen?.value).toBe(15)
    expect(result.status).not.toBe('recognized')
    expect(result).not.toHaveProperty('savedProductProfileId')
    expect(result).not.toHaveProperty('inventoryRecordId')
  })
})

describe('fertilizerEnrichmentStoredSourceResolverCore server runtime wiring', () => {
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
    sourceStorage: {
      bucket: 'fertilizer-enrichment-sources',
      maxTextBytes: 512 * 1024,
    },
  }

  it('ARF-4: runtime with source storage config wires productive adapters', () => {
    const runtime = createFertilizerEnrichmentServerRuntime({
      environment: TEST_ENVIRONMENT,
      supabase: {
        storage: {
          from: vi.fn(() => ({
            download: vi.fn(async () => ({
              data: new Blob(['Manufacturer: ICL\nNPK 15-0-26'], { type: 'text/plain' }),
              error: null,
            })),
          })),
        },
      } as unknown as SupabaseClient,
      authValidator: { validateBearerToken: async () => null },
    })

    expect(runtime.environment.sourceStorage?.bucket).toBe('fertilizer-enrichment-sources')
    expect(runtime.handlers.handleStart).toBeTypeOf('function')
  })
})
