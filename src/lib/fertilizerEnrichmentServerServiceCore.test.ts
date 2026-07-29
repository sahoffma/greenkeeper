import { describe, expect, it, vi } from 'vitest'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'
import type {
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentJob,
  FertilizerEnrichmentOrchestrationInput,
  FertilizerSourceAdapterResult,
  FertilizerSourceAdapterType,
  FertilizerEnrichmentTimeoutState,
} from '../types/fertilizerEnrichmentOrchestration'
import {
  assertPublicFertilizerEnrichmentJobShape,
  createInMemoryFertilizerEnrichmentJobRepository,
  serializedPublicJobHasNoInternalLeakage,
  type FertilizerEnrichmentJobRecord,
} from './fertilizerEnrichmentJobRepositoryCore'
import * as orchestrationCore from './fertilizerEnrichmentOrchestrationCore'
import {
  createFertilizerEnrichmentServerService,
  createTestOrchestrationDependencies,
  createTestResolveExpiresAt,
  FertilizerEnrichmentServerApiError,
  type FertilizerEnrichmentServerRequestContext,
} from './fertilizerEnrichmentServerServiceCore'
import type { FertilizerSourceAdapter } from './fertilizerEnrichmentOrchestrationCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const TEST_EXPIRES_AT = '2026-08-05T10:00:00.000Z'
const ACCESS: FertilizerEnrichmentAccessContext = { kind: 'session', sessionId: 'session-1' }
const OTHER_ACCESS: FertilizerEnrichmentAccessContext = { kind: 'session', sessionId: 'session-2' }
const REQUEST_CTX: FertilizerEnrichmentServerRequestContext = {
  sessionId: 'session-1',
  requestId: 'req-1',
}

function emptyTimeoutState(): FertilizerEnrichmentTimeoutState {
  return {
    kind: 'none',
    startedAt: FIXED_NOW,
    timedOut: false,
    timedOutAdapters: [],
    completedAdapters: [],
    cancelledAdapters: [],
  }
}

function buildInput(
  overrides: Partial<FertilizerEnrichmentOrchestrationInput> = {},
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
    ...overrides,
  }
}

function adapterResultBase(
  adapterType: FertilizerSourceAdapterType,
  overrides: Partial<FertilizerSourceAdapterResult> = {},
): FertilizerSourceAdapterResult {
  return {
    adapterType,
    status: 'success',
    sourceId: `${adapterType}-source`,
    sourceType: adapterType === 'manufacturer_product_document' ? 'pdf_document' : 'web_page',
    sourceCategory: 'official_document',
    retrievedAt: FIXED_NOW,
    extraction: {},
    ...overrides,
  } as FertilizerSourceAdapterResult
}

function fullDocumentExtraction(): Extract<FertilizerSourceAdapterResult, { status: 'success' }>['extraction'] {
  return {
    extractedProductForm: 'granular',
    extractedNpk: {
      nitrogen: 15,
      phosphate: 0,
      potash: 26,
      declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
    },
    extractedNutrients: FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => ({
      key,
      value: 1,
      declarationBasis: 'N',
      unit: '%' as const,
    })),
    coverageMetadata: {
      fieldsCovered: ['npk', 'nutrientMatrix'],
      nutrientSectionLocated: true,
      nutrientSectionFullyCaptured: true,
      variantMatched: true,
      productScopeConfirmed: true,
    },
  }
}

function fakeAdapter(
  adapterType: FertilizerSourceAdapterType,
  result: FertilizerSourceAdapterResult,
): FertilizerSourceAdapter {
  return {
    adapterType,
    run: async () => result,
  }
}

function createService(
  adapters: FertilizerSourceAdapter[],
  overrides: {
    repository?: ReturnType<typeof createInMemoryFertilizerEnrichmentJobRepository>
    orchestrationSpy?: ReturnType<typeof vi.spyOn>
  } = {},
) {
  const repository = overrides.repository ?? createInMemoryFertilizerEnrichmentJobRepository()
  const orchestrationSpy =
    overrides.orchestrationSpy ??
    vi.spyOn(orchestrationCore, 'orchestrateFertilizerEnrichment')

  const service = createFertilizerEnrichmentServerService({
    repository,
    resolveOrchestrationDependencies: () =>
      createTestOrchestrationDependencies(adapters, {
        now: () => FIXED_NOW,
        createOrchestrationRunId: () => 'orch-run',
        createNormalizationRunId: () => 'norm-run',
      }),
    now: () => FIXED_NOW,
    createJobId: () => 'job-1',
    createOrchestrationRunId: () => 'orch-run',
    createNormalizationRunId: () => 'norm-run',
    resolveExpiresAt: createTestResolveExpiresAt(TEST_EXPIRES_AT),
  })

  return { service, repository, orchestrationSpy }
}

function needsInputRecord(
  overrides: Partial<FertilizerEnrichmentJobRecord> = {},
): FertilizerEnrichmentJobRecord {
  return {
    job: {
      jobId: 'job-1',
      orchestrationRunId: 'orch-run',
      idempotencyKey: 'idem-1',
      accessContext: ACCESS,
      objectCategory: 'fertilizer',
      identityFingerprint: 'icl-spring-start-15-0-26',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      expiresAt: TEST_EXPIRES_AT,
      result: {
        orchestrationRunId: 'orch-run',
        startedAt: FIXED_NOW,
        completedAt: FIXED_NOW,
        attemptedAdapters: ['manufacturer_product_document'],
        successfulAdapters: [],
        failedAdapters: [],
        timeoutState: emptyTimeoutState(),
        technicalErrors: [],
        status: 'needs_input',
        recommendedNextAction: 'upload_product_document',
      },
    },
    orchestrationInput: buildInput(),
    lastSourceProvisionIdempotencyKey: null,
    recordSchemaVersion: 1,
    revision: 1,
    ...overrides,
  }
}

describe('fertilizerEnrichmentServerServiceCore', () => {
  it('S-1: start creates job, runs orchestration once, and persists result', async () => {
    const { service, repository, orchestrationSpy } = createService([
      fakeAdapter(
        'manufacturer_product_document',
        adapterResultBase('manufacturer_product_document', { extraction: fullDocumentExtraction() }),
      ),
    ])

    const job = await service.startFertilizerEnrichment(
      { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-1' },
      REQUEST_CTX,
    )

    expect(orchestrationSpy).toHaveBeenCalledTimes(1)
    expect(job.jobId).toBe('job-1')
    expect(await repository.getByJobId('job-1', ACCESS)).not.toBeNull()
    expect(job.result.status).toBe('intake_ready')
  })

  it('S-2: idempotent start returns existing job without second orchestration', async () => {
    const { service, orchestrationSpy } = createService([
      fakeAdapter(
        'manufacturer_product_document',
        adapterResultBase('manufacturer_product_document', { status: 'no_match' }),
      ),
    ])

    await service.startFertilizerEnrichment(
      { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-1' },
      REQUEST_CTX,
    )
    orchestrationSpy.mockClear()

    const second = await service.startFertilizerEnrichment(
      { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-1' },
      REQUEST_CTX,
    )

    expect(orchestrationSpy).not.toHaveBeenCalled()
    expect(second.jobId).toBe('job-1')
  })

  it('S-3: same idempotency key with different access creates separate job', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    const { service, orchestrationSpy } = createService(
      [
        fakeAdapter(
          'manufacturer_product_document',
          adapterResultBase('manufacturer_product_document', { status: 'no_match' }),
        ),
      ],
      { repository },
    )

    await service.startFertilizerEnrichment(
      { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-1' },
      REQUEST_CTX,
    )

    const serviceOther = createFertilizerEnrichmentServerService({
      repository,
      resolveOrchestrationDependencies: () =>
        createTestOrchestrationDependencies([
          fakeAdapter(
            'manufacturer_product_document',
            adapterResultBase('manufacturer_product_document', { status: 'no_match' }),
          ),
        ]),
      now: () => FIXED_NOW,
      createJobId: () => 'job-2',
      createOrchestrationRunId: () => 'orch-run-2',
      resolveExpiresAt: createTestResolveExpiresAt(TEST_EXPIRES_AT),
    })

    orchestrationSpy.mockClear()
    const otherJob = await serviceOther.startFertilizerEnrichment(
      { input: buildInput(), accessContext: OTHER_ACCESS, idempotencyKey: 'idem-1' },
      { sessionId: 'session-2', requestId: 'req-2' },
    )

    expect(orchestrationSpy).toHaveBeenCalledTimes(1)
    expect(otherJob.jobId).toBe('job-2')
  })

  it('S-4: unsupported object category returns API error without orchestration', async () => {
    const { service, orchestrationSpy } = createService([])

    await expect(
      service.startFertilizerEnrichment(
        {
          input: { ...buildInput(), objectCategory: 'tool' as 'fertilizer' },
          accessContext: ACCESS,
          idempotencyKey: 'idem-1',
        },
        REQUEST_CTX,
      ),
    ).rejects.toMatchObject({
      apiError: { code: 'unsupported_object_category' },
      httpStatus: 422,
    })

    expect(orchestrationSpy).not.toHaveBeenCalled()
  })

  it('S-5: invalid request returns controlled API error', async () => {
    const { service } = createService([])

    await expect(
      service.startFertilizerEnrichment(
        { input: buildInput(), accessContext: ACCESS, idempotencyKey: '   ' },
        REQUEST_CTX,
      ),
    ).rejects.toBeInstanceOf(FertilizerEnrichmentServerApiError)
  })

  it('S-6: intake_ready result is stored without save side effects', async () => {
    const { service } = createService([
      fakeAdapter(
        'manufacturer_product_document',
        adapterResultBase('manufacturer_product_document', { extraction: fullDocumentExtraction() }),
      ),
    ])

    const job = await service.startFertilizerEnrichment(
      { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-ready' },
      REQUEST_CTX,
    )

    expect(job.result.status).toBe('intake_ready')
    expect(job).not.toHaveProperty('inventorySaved')
  })

  it('S-7: needs_input result remains continuable', async () => {
    const { service } = createService([
      fakeAdapter(
        'manufacturer_product_document',
        adapterResultBase('manufacturer_product_document', {
          status: 'partial',
          extraction: {
            extractedNpk: {
              nitrogen: 15,
              phosphate: 0,
              potash: 26,
              declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
            },
            coverageMetadata: {
              fieldsCovered: ['npk'],
              nutrientSectionLocated: true,
              nutrientSectionFullyCaptured: false,
              variantMatched: true,
              productScopeConfirmed: true,
            },
          },
        }),
      ),
    ])

    const job = await service.startFertilizerEnrichment(
      { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-needs' },
      REQUEST_CTX,
    )

    expect(job.result.status).toBe('needs_input')
    if (job.result.status === 'needs_input') {
      expect(job.result.recommendedNextAction).toBeTruthy()
    }
  })

  it('S-8: orchestration contract error maps to unsupported_object_category', async () => {
    const orchestrationSpy = vi
      .spyOn(orchestrationCore, 'orchestrateFertilizerEnrichment')
      .mockRejectedValue(new orchestrationCore.FertilizerEnrichmentOrchestrationContractError('tool'))

    const service = createFertilizerEnrichmentServerService({
      repository: createInMemoryFertilizerEnrichmentJobRepository(),
      resolveOrchestrationDependencies: () => createTestOrchestrationDependencies([]),
      now: () => FIXED_NOW,
      createJobId: () => 'job-contract',
      resolveExpiresAt: createTestResolveExpiresAt(TEST_EXPIRES_AT),
    })

    await expect(
      service.startFertilizerEnrichment(
        { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-contract' },
        REQUEST_CTX,
      ),
    ).rejects.toMatchObject({ apiError: { code: 'unsupported_object_category' } })

    orchestrationSpy.mockRestore()
  })

  it('S-9: unexpected orchestration error maps to internal_server_error without original message', async () => {
    const orchestrationSpy = vi
      .spyOn(orchestrationCore, 'orchestrateFertilizerEnrichment')
      .mockRejectedValue(new Error('Sensitive orchestration failure'))

    const service = createFertilizerEnrichmentServerService({
      repository: createInMemoryFertilizerEnrichmentJobRepository(),
      resolveOrchestrationDependencies: () => createTestOrchestrationDependencies([]),
      now: () => FIXED_NOW,
      createJobId: () => 'job-unexpected',
      resolveExpiresAt: createTestResolveExpiresAt(TEST_EXPIRES_AT),
    })

    await expect(
      service.startFertilizerEnrichment(
        { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-unexpected' },
        REQUEST_CTX,
      ),
    ).rejects.toMatchObject({
      apiError: {
        code: 'internal_server_error',
        message: expect.not.stringContaining('Sensitive'),
      },
    })

    orchestrationSpy.mockRestore()
  })

  it('G-1: status returns authorized job', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service } = createService([], { repository })

    const job = await service.getFertilizerEnrichmentStatus(
      { jobId: 'job-1', accessContext: ACCESS },
      REQUEST_CTX,
    )

    expect(job.jobId).toBe('job-1')
    expect(job.result.status).toBe('needs_input')
  })

  it('G-2: status for foreign job returns not found without existence leak', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service } = createService([], { repository })

    await expect(
      service.getFertilizerEnrichmentStatus(
        { jobId: 'job-1', accessContext: OTHER_ACCESS },
        { sessionId: 'session-2', requestId: 'req-2' },
      ),
    ).rejects.toMatchObject({ apiError: { code: 'job_not_found' }, httpStatus: 404 })
  })

  it('G-3: status for missing job returns not found', async () => {
    const { service } = createService([])

    await expect(
      service.getFertilizerEnrichmentStatus(
        { jobId: 'missing', accessContext: ACCESS },
        REQUEST_CTX,
      ),
    ).rejects.toMatchObject({ apiError: { code: 'job_not_found' }, httpStatus: 404 })
  })

  it('G-4: status does not rerun orchestration', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service, orchestrationSpy } = createService([], { repository })

    await service.getFertilizerEnrichmentStatus(
      { jobId: 'job-1', accessContext: ACCESS },
      REQUEST_CTX,
    )

    expect(orchestrationSpy).not.toHaveBeenCalled()
  })

  it('A-1: additional user document source continues needs_input job', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service, orchestrationSpy } = createService(
      [
        fakeAdapter(
          'user_document',
          adapterResultBase('user_document', {
            sourceType: 'text_document',
            sourceCategory: 'user_provided',
            extraction: fullDocumentExtraction(),
          }),
        ),
      ],
      { repository },
    )

    orchestrationSpy.mockClear()
    const job = await service.provideAdditionalFertilizerEnrichmentSource(
      {
        jobId: 'job-1',
        accessContext: ACCESS,
        idempotencyKey: 'source-1',
        additionalSources: [{ kind: 'product_document', referenceId: 'doc-1' }],
      },
      REQUEST_CTX,
    )

    expect(orchestrationSpy).toHaveBeenCalledTimes(1)
    expect(job.jobId).toBe('job-1')
    const stored = await repository.getByJobId('job-1', ACCESS)
    expect(stored?.orchestrationInput.userProvidedSources).toEqual([
      { kind: 'product_document', referenceId: 'doc-1', label: null, productVariantReference: null },
    ])
    assertPublicFertilizerEnrichmentJobShape(job)
    expect(serializedPublicJobHasNoInternalLeakage({ job })).toBe(true)
  })

  it('A-2: additional packaging source continues needs_input job', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service, orchestrationSpy } = createService(
      [
        fakeAdapter(
          'packaging',
          adapterResultBase('packaging', {
            sourceType: 'packaging_label_text',
            sourceCategory: 'packaging_evidence',
            extraction: fullDocumentExtraction(),
          }),
        ),
      ],
      { repository },
    )

    orchestrationSpy.mockClear()
    const job = await service.provideAdditionalFertilizerEnrichmentSource(
      {
        jobId: 'job-1',
        accessContext: ACCESS,
        idempotencyKey: 'source-pack',
        additionalSources: [{ kind: 'packaging_back_photo', referenceId: 'pack-1' }],
      },
      REQUEST_CTX,
    )

    expect(orchestrationSpy).toHaveBeenCalledTimes(1)
    const stored = await repository.getByJobId('job-1', ACCESS)
    expect(stored?.orchestrationInput.sourceHints?.[0]?.adapterType).toBe('packaging')
    expect(serializedPublicJobHasNoInternalLeakage({ job })).toBe(true)
  })

  it('A-3: duplicate source does not rerun orchestration', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(
      needsInputRecord({
        orchestrationInput: buildInput({
          userProvidedSources: [{ kind: 'product_document', referenceId: 'doc-1' }],
          sourceHints: [{ referenceId: 'doc-1', adapterType: 'user_document', hintType: 'user' }],
        }),
      }),
    )
    const { service, orchestrationSpy } = createService([], { repository })

    orchestrationSpy.mockClear()
    const job = await service.provideAdditionalFertilizerEnrichmentSource(
      {
        jobId: 'job-1',
        accessContext: ACCESS,
        idempotencyKey: 'source-dup',
        additionalSources: [{ kind: 'product_document', referenceId: 'doc-1' }],
      },
      REQUEST_CTX,
    )

    expect(orchestrationSpy).not.toHaveBeenCalled()
    expect(job.jobId).toBe('job-1')
  })

  it('A-4: unsupported additional source kind is rejected', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service } = createService([], { repository })

    await expect(
      service.provideAdditionalFertilizerEnrichmentSource(
        {
          jobId: 'job-1',
          accessContext: ACCESS,
          idempotencyKey: 'source-bad',
          additionalSources: [{ kind: 'barcode', referenceId: 'bc-1' }],
        },
        REQUEST_CTX,
      ),
    ).rejects.toMatchObject({ apiError: { code: 'invalid_request' } })
  })

  it('A-5: additional source on intake_ready is rejected', async () => {
    const { service } = createService([
      fakeAdapter(
        'manufacturer_product_document',
        adapterResultBase('manufacturer_product_document', { extraction: fullDocumentExtraction() }),
      ),
    ])

    const readyJob = await service.startFertilizerEnrichment(
      { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-ready-block' },
      REQUEST_CTX,
    )
    expect(readyJob.result.status).toBe('intake_ready')

    await expect(
      service.provideAdditionalFertilizerEnrichmentSource(
        {
          jobId: readyJob.jobId,
          accessContext: ACCESS,
          idempotencyKey: 'source-after-ready',
          additionalSources: [{ kind: 'product_document', referenceId: 'doc-2' }],
        },
        REQUEST_CTX,
      ),
    ).rejects.toMatchObject({ apiError: { code: 'orchestration_not_cancellable' } })
  })

  it('A-6: additional source on domain_not_ready failure is rejected', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(
      needsInputRecord({
        job: {
          ...needsInputRecord().job,
          result: {
            orchestrationRunId: 'orch-run',
            startedAt: FIXED_NOW,
            completedAt: FIXED_NOW,
            attemptedAdapters: [],
            successfulAdapters: [],
            failedAdapters: [],
            timeoutState: emptyTimeoutState(),
            technicalErrors: [],
            status: 'failed',
            failureReason: 'domain_not_ready',
            readinessResult: {
              status: 'not_ready',
              specificationVersion: 'fertilizer-readiness-v1',
              evaluatedAt: FIXED_NOW,
              missingRequirements: ['ingredients.matrix'],
              fulfilledRequirements: [],
              blockingIssues: [],
              suggestedInputActions: [],
            },
          },
        },
      }),
    )
    const { service } = createService([], { repository })

    await expect(
      service.provideAdditionalFertilizerEnrichmentSource(
        {
          jobId: 'job-1',
          accessContext: ACCESS,
          idempotencyKey: 'source-failed',
          additionalSources: [{ kind: 'product_document', referenceId: 'doc-3' }],
        },
        REQUEST_CTX,
      ),
    ).rejects.toMatchObject({ apiError: { code: 'orchestration_not_cancellable' } })
  })

  it('A-7: additional source on foreign job is not found', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service } = createService([], { repository })

    await expect(
      service.provideAdditionalFertilizerEnrichmentSource(
        {
          jobId: 'job-1',
          accessContext: OTHER_ACCESS,
          idempotencyKey: 'source-foreign',
          additionalSources: [{ kind: 'product_document', referenceId: 'doc-4' }],
        },
        { sessionId: 'session-2', requestId: 'req-2' },
      ),
    ).rejects.toMatchObject({ apiError: { code: 'job_not_found' } })
  })

  it('A-8: identity fingerprint remains unchanged on continuation', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service } = createService(
      [
        fakeAdapter(
          'user_document',
          adapterResultBase('user_document', {
            sourceType: 'text_document',
            sourceCategory: 'user_provided',
            extraction: fullDocumentExtraction(),
          }),
        ),
      ],
      { repository },
    )

    const job = await service.provideAdditionalFertilizerEnrichmentSource(
      {
        jobId: 'job-1',
        accessContext: ACCESS,
        idempotencyKey: 'source-identity',
        additionalSources: [{ kind: 'product_document', referenceId: 'doc-5' }],
      },
      REQUEST_CTX,
    )

    expect(job.identityFingerprint).toBe('icl-spring-start-15-0-26')
    const stored = await repository.getByJobId('job-1', ACCESS)
    expect(stored?.orchestrationInput.identity.identityFingerprint).toBe('icl-spring-start-15-0-26')
    expect(serializedPublicJobHasNoInternalLeakage({ job })).toBe(true)
  })

  it('A-9: existing sources remain when adding a new source', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(
      needsInputRecord({
        orchestrationInput: buildInput({
          userProvidedSources: [{ kind: 'packaging_back_photo', referenceId: 'pack-old' }],
          sourceHints: [{ referenceId: 'pack-old', adapterType: 'packaging', hintType: 'user' }],
        }),
      }),
    )
    const { service } = createService(
      [
        fakeAdapter(
          'user_document',
          adapterResultBase('user_document', {
            sourceType: 'text_document',
            sourceCategory: 'user_provided',
            status: 'partial',
          }),
        ),
      ],
      { repository },
    )

    const job = await service.provideAdditionalFertilizerEnrichmentSource(
      {
        jobId: 'job-1',
        accessContext: ACCESS,
        idempotencyKey: 'source-keep',
        additionalSources: [{ kind: 'product_document', referenceId: 'doc-6' }],
      },
      REQUEST_CTX,
    )

    const stored = await repository.getByJobId('job-1', ACCESS)
    expect(stored?.orchestrationInput.userProvidedSources).toEqual([
      expect.objectContaining({ kind: 'packaging_back_photo', referenceId: 'pack-old' }),
      { kind: 'product_document', referenceId: 'doc-6', label: null, productVariantReference: null },
    ])
    expect(serializedPublicJobHasNoInternalLeakage({ job })).toBe(true)
  })

  it('C-1: cancel sets cancelled result without orchestration', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service, orchestrationSpy } = createService([], { repository })

    orchestrationSpy.mockClear()
    const job = await service.cancelFertilizerEnrichment(
      { jobId: 'job-1', accessContext: ACCESS },
      REQUEST_CTX,
    )

    expect(orchestrationSpy).not.toHaveBeenCalled()
    expect(job.result.status).toBe('cancelled')
  })

  it('C-2: cancel is idempotent for already cancelled job', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(
      needsInputRecord({
        job: {
          ...needsInputRecord().job,
          result: {
            orchestrationRunId: 'orch-run',
            startedAt: FIXED_NOW,
            completedAt: FIXED_NOW,
            attemptedAdapters: [],
            successfulAdapters: [],
            failedAdapters: [],
            timeoutState: emptyTimeoutState(),
            technicalErrors: [],
            status: 'cancelled',
            cancellation: {
              reason: 'user_cancelled',
              cancelledAt: FIXED_NOW,
              cancelledBy: 'user',
            },
          },
        },
      }),
    )
    const { service } = createService([], { repository })

    const job = await service.cancelFertilizerEnrichment(
      { jobId: 'job-1', accessContext: ACCESS },
      REQUEST_CTX,
    )

    expect(job.result.status).toBe('cancelled')
  })

  it('C-3: cancel does not overwrite intake_ready', async () => {
    const { service } = createService([
      fakeAdapter(
        'manufacturer_product_document',
        adapterResultBase('manufacturer_product_document', { extraction: fullDocumentExtraction() }),
      ),
    ])

    const readyJob = await service.startFertilizerEnrichment(
      { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-cancel-ready' },
      REQUEST_CTX,
    )

    await expect(
      service.cancelFertilizerEnrichment(
        { jobId: readyJob.jobId, accessContext: ACCESS },
        REQUEST_CTX,
      ),
    ).rejects.toMatchObject({ apiError: { code: 'orchestration_not_cancellable' } })
  })

  it('C-4: cancel on foreign job is not found', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(needsInputRecord())
    const { service } = createService([], { repository })

    await expect(
      service.cancelFertilizerEnrichment(
        { jobId: 'job-1', accessContext: OTHER_ACCESS },
        { sessionId: 'session-2', requestId: 'req-2' },
      ),
    ).rejects.toMatchObject({ apiError: { code: 'job_not_found' } })
  })

  it('C-5: cancel on missing job returns not found', async () => {
    const { service } = createService([])

    await expect(
      service.cancelFertilizerEnrichment(
        { jobId: 'missing', accessContext: ACCESS },
        REQUEST_CTX,
      ),
    ).rejects.toMatchObject({ apiError: { code: 'job_not_found' } })
  })

  describe('service response leakage', () => {
    it('L-1: start response exposes only public job fields', async () => {
      const { service } = createService([
        fakeAdapter(
          'manufacturer_product_document',
          adapterResultBase('manufacturer_product_document', { status: 'no_match' }),
        ),
      ])

      const job = await service.startFertilizerEnrichment(
        { input: buildInput(), accessContext: ACCESS, idempotencyKey: 'idem-leak-start' },
        REQUEST_CTX,
      )

      assertPublicFertilizerEnrichmentJobShape(job)
      expect(serializedPublicJobHasNoInternalLeakage({ job })).toBe(true)
    })

    it('L-2: status response exposes only public job fields', async () => {
      const repository = createInMemoryFertilizerEnrichmentJobRepository()
      await repository.save(needsInputRecord())
      const { service } = createService([], { repository })

      const job = await service.getFertilizerEnrichmentStatus(
        { jobId: 'job-1', accessContext: ACCESS },
        REQUEST_CTX,
      )

      assertPublicFertilizerEnrichmentJobShape(job)
      expect(serializedPublicJobHasNoInternalLeakage({ job })).toBe(true)
    })

    it('L-3: additional source response exposes only public job fields', async () => {
      const repository = createInMemoryFertilizerEnrichmentJobRepository()
      await repository.save(needsInputRecord())
      const { service } = createService(
        [
          fakeAdapter(
            'user_document',
            adapterResultBase('user_document', {
              sourceType: 'text_document',
              sourceCategory: 'user_provided',
              status: 'partial',
            }),
          ),
        ],
        { repository },
      )

      const job = await service.provideAdditionalFertilizerEnrichmentSource(
        {
          jobId: 'job-1',
          accessContext: ACCESS,
          idempotencyKey: 'source-leak',
          additionalSources: [{ kind: 'product_document', referenceId: 'doc-leak' }],
        },
        REQUEST_CTX,
      )

      assertPublicFertilizerEnrichmentJobShape(job)
      expect(serializedPublicJobHasNoInternalLeakage({ job })).toBe(true)
    })

    it('L-4: cancel response exposes only public job fields', async () => {
      const repository = createInMemoryFertilizerEnrichmentJobRepository()
      await repository.save(needsInputRecord())
      const { service } = createService([], { repository })

      const job = await service.cancelFertilizerEnrichment(
        { jobId: 'job-1', accessContext: ACCESS },
        REQUEST_CTX,
      )

      assertPublicFertilizerEnrichmentJobShape(job)
      expect(serializedPublicJobHasNoInternalLeakage({ job })).toBe(true)
    })

    it('L-5: public job type has no internal continuation fields', () => {
      const job: FertilizerEnrichmentJob = needsInputRecord().job
      assertPublicFertilizerEnrichmentJobShape(job)
      expect(job).not.toHaveProperty('lastOrchestrationInput')
      expect(job).not.toHaveProperty('lastSourceProvisionIdempotencyKey')
      expect(job).not.toHaveProperty('orchestrationInput')
    })

    it('L-6: internal record keeps orchestrationInput and provision idempotency server-side', async () => {
      const repository = createInMemoryFertilizerEnrichmentJobRepository()
      await repository.save(needsInputRecord())
      const stored = await repository.getByJobId('job-1', ACCESS)

      expect(stored?.orchestrationInput.identity.identityFingerprint).toBe('icl-spring-start-15-0-26')
      expect(stored).toHaveProperty('lastSourceProvisionIdempotencyKey')
      expect(stored?.job.result.status).toBe('needs_input')
    })
  })
})
