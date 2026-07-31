import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentJobRecord } from './fertilizerEnrichmentJobRepositoryCore'
import { createInMemoryFertilizerEnrichmentJobRepository } from './fertilizerEnrichmentJobRepositoryCore'
import { createInMemoryFertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import {
  assertNoClientProductProfileSaveFields,
  createFertilizerProductProfileSaveServerService,
  FertilizerProductProfileSaveServerApiError,
  validateSaveFertilizerProductProfileRequest,
} from './fertilizerProductProfileSaveServerServiceCore'
import {
  assertNoSensitiveLeakage,
  buildPhase5IntakeReadyResult,
  deriveTestSessionAccessHash,
  PHASE5_FIXED_NOW,
  PHASE5_SESSION_HASH,
  PHASE5_SESSION_ID,
  withNpk,
} from './fertilizerProductProfileSaveTestFixtures'

const ACCESS = { kind: 'session' as const, sessionId: PHASE5_SESSION_ID }
const OTHER_ACCESS = { kind: 'session' as const, sessionId: 'other-session' }
const USER_ACCESS = { kind: 'authenticated_user' as const, userId: 'user-save-1' }
const TEST_EXPIRES_AT = '2026-08-05T10:00:00.000Z'
const EXPIRED_AT = '2026-07-01T10:00:00.000Z'

function intakeReadyRecord(
  overrides: Partial<FertilizerEnrichmentJobRecord> = {},
): FertilizerEnrichmentJobRecord {
  return {
    job: {
      jobId: 'job-save-1',
      orchestrationRunId: 'orch-save-1',
      idempotencyKey: 'enrichment-idem-1',
      accessContext: ACCESS,
      objectCategory: 'fertilizer',
      identityFingerprint: 'fp-save-1',
      createdAt: PHASE5_FIXED_NOW,
      updatedAt: PHASE5_FIXED_NOW,
      expiresAt: TEST_EXPIRES_AT,
      result: buildPhase5IntakeReadyResult(),
    },
    orchestrationInput: {
      objectCategory: 'fertilizer',
      identity: {
        manufacturer: 'ICL',
        officialName: 'Spring Start',
        variant: null,
        identityFingerprint: 'fp-save-1',
        identityConfidence: 1,
        hasIdentityAmbiguity: false,
      },
      allowedInputChannels: ['capture_flow'],
    },
    lastSourceProvisionIdempotencyKey: null,
    recordSchemaVersion: 1,
    revision: 1,
    ...overrides,
  }
}

function createSaveService(
  enrichmentRecords: FertilizerEnrichmentJobRecord[] = [intakeReadyRecord()],
) {
  const enrichmentJobRepository = createInMemoryFertilizerEnrichmentJobRepository()
  for (const record of enrichmentRecords) {
    enrichmentJobRepository.state.byJobId.set(record.job.jobId, structuredClone(record))
  }

  const productProfileRepository = createInMemoryFertilizerProductProfileRepository({
    deriveSessionAccessHash: deriveTestSessionAccessHash,
  })

  const service = createFertilizerProductProfileSaveServerService({
    enrichmentJobRepository,
    productProfileRepository,
    deriveSessionAccessHash: deriveTestSessionAccessHash,
    now: () => PHASE5_FIXED_NOW,
  })

  return {
    service,
    enrichmentJobRepository,
    productProfileRepository,
  }
}

describe('fertilizerProductProfileSaveServerServiceCore', () => {
  it('validates required request fields', () => {
    expect(() =>
      validateSaveFertilizerProductProfileRequest({
        enrichmentJobId: 'job-save-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-1',
      }),
    ).not.toThrow()

    expect(() =>
      validateSaveFertilizerProductProfileRequest({
        enrichmentJobId: 'job-save-1',
        userConfirmed: false,
        idempotencyKey: 'save-idem-1',
      }),
    ).toThrow(FertilizerProductProfileSaveServerApiError)

    expect(() =>
      validateSaveFertilizerProductProfileRequest({
        enrichmentJobId: 'job-save-1',
        idempotencyKey: 'save-idem-1',
      }),
    ).toThrow(FertilizerProductProfileSaveServerApiError)
  })

  it('rejects forbidden client fields', () => {
    expect(() =>
      assertNoClientProductProfileSaveFields({
        enrichmentJobId: 'job-save-1',
        pipelineResult: {},
      }),
    ).toThrow(FertilizerProductProfileSaveServerApiError)
  })

  it('saves intake_ready job and returns public profile', async () => {
    const { service } = createSaveService()

    const result = await service.saveFertilizerProductProfile(
      {
        enrichmentJobId: 'job-save-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-1',
      },
      ACCESS,
    )

    expect(result.profile.officialName).toBe('Spring Start')
    expect(result.reusedExistingVersion).toBe(false)
    assertNoSensitiveLeakage(JSON.stringify(result))
    expect(JSON.stringify(result)).not.toContain(PHASE5_SESSION_HASH)
    expect(JSON.stringify(result)).not.toContain('compositionFingerprint')
  })

  it('returns 404 for foreign enrichment job without existence leak', async () => {
    const { service } = createSaveService()

    await expect(
      service.saveFertilizerProductProfile(
        {
          enrichmentJobId: 'job-save-1',
          userConfirmed: true,
          idempotencyKey: 'save-idem-foreign',
        },
        OTHER_ACCESS,
      ),
    ).rejects.toMatchObject({
      apiError: { code: 'job_not_found' },
      httpStatus: 404,
    })
  })

  it('rejects expired jobs', async () => {
    const { service } = createSaveService([
      intakeReadyRecord({
        job: {
          ...intakeReadyRecord().job,
          expiresAt: EXPIRED_AT,
        },
      }),
    ])

    await expect(
      service.saveFertilizerProductProfile(
        {
          enrichmentJobId: 'job-save-1',
          userConfirmed: true,
          idempotencyKey: 'save-idem-expired',
        },
        ACCESS,
      ),
    ).rejects.toMatchObject({
      apiError: { code: 'job_expired' },
      httpStatus: 410,
    })
  })

  it('rejects non-intake_ready jobs', async () => {
    const record = intakeReadyRecord()
    record.job.result = {
      ...buildPhase5IntakeReadyResult(),
      status: 'needs_input',
      recommendedNextAction: 'upload_product_document',
    }

    const { service } = createSaveService([record])

    await expect(
      service.saveFertilizerProductProfile(
        {
          enrichmentJobId: 'job-save-1',
          userConfirmed: true,
          idempotencyKey: 'save-idem-not-ready',
        },
        ACCESS,
      ),
    ).rejects.toMatchObject({
      apiError: { code: 'not_save_ready' },
      httpStatus: 422,
    })
  })

  it('reuses existing version for same declaration', async () => {
    const { service, enrichmentJobRepository } = createSaveService()

    const first = await service.saveFertilizerProductProfile(
      {
        enrichmentJobId: 'job-save-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-reuse-a',
      },
      ACCESS,
    )

    enrichmentJobRepository.state.byJobId.set(
      'job-save-2',
      structuredClone(
        intakeReadyRecord({
          job: {
            ...intakeReadyRecord().job,
            jobId: 'job-save-2',
          },
        }),
      ),
    )

    const second = await service.saveFertilizerProductProfile(
      {
        enrichmentJobId: 'job-save-2',
        userConfirmed: true,
        idempotencyKey: 'save-idem-reuse-b',
      },
      ACCESS,
    )

    expect(second.reusedExistingVersion).toBe(true)
    expect(second.profile.id).toBe(first.profile.id)
  })

  it('creates new version when recipe changes', async () => {
    const { service, enrichmentJobRepository } = createSaveService()

    const first = await service.saveFertilizerProductProfile(
      {
        enrichmentJobId: 'job-save-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-recipe-a',
      },
      ACCESS,
    )

    enrichmentJobRepository.state.byJobId.set(
      'job-save-changed',
      structuredClone(
        intakeReadyRecord({
          job: {
            ...intakeReadyRecord().job,
            jobId: 'job-save-changed',
            result: buildPhase5IntakeReadyResult(withNpk(0, 0, 29)),
          },
        }),
      ),
    )

    const second = await service.saveFertilizerProductProfile(
      {
        enrichmentJobId: 'job-save-changed',
        userConfirmed: true,
        idempotencyKey: 'save-idem-recipe-b',
      },
      ACCESS,
    )

    expect(second.profile.id).not.toBe(first.profile.id)
    expect(second.profile.potash).toBe(29)
  })

  it('supports authenticated user access', async () => {
    const record = intakeReadyRecord({
      job: {
        ...intakeReadyRecord().job,
        accessContext: USER_ACCESS,
      },
    })
    const { service } = createSaveService([record])

    const result = await service.saveFertilizerProductProfile(
      {
        enrichmentJobId: 'job-save-1',
        userConfirmed: true,
        idempotencyKey: 'save-idem-user',
      },
      USER_ACCESS,
    )

    expect(result.profile.officialName).toBe('Spring Start')
  })

  it('returns same result for repeated idempotency key', async () => {
    const { service } = createSaveService()

    const request = {
      enrichmentJobId: 'job-save-1',
      userConfirmed: true as const,
      idempotencyKey: 'save-idem-repeat',
    }

    const first = await service.saveFertilizerProductProfile(request, ACCESS)
    const second = await service.saveFertilizerProductProfile(request, ACCESS)

    expect(second.profile.id).toBe(first.profile.id)
    expect(second.reusedExistingVersion).toBe(true)
  })

  it('handles parallel identical saves without duplicate versions', async () => {
    const { service } = createSaveService()
    const request = {
      enrichmentJobId: 'job-save-1',
      userConfirmed: true as const,
      idempotencyKey: 'save-idem-parallel',
    }

    const [first, second] = await Promise.all([
      service.saveFertilizerProductProfile(request, ACCESS),
      service.saveFertilizerProductProfile(request, ACCESS),
    ])

    expect(first.profile.id).toBe(second.profile.id)
  })
})
