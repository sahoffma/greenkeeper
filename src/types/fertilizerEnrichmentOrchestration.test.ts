import { describe, expect, it } from 'vitest'
import {
  FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
} from './fertilizerDeclarationNormalization'
import { FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION } from './fertilizerEnrichment'
import { FERTILIZER_READINESS_SPECIFICATION_VERSION } from './fertilizerReadiness'
import {
  FERTILIZER_ENRICHMENT_API_ERROR_CODES,
  FERTILIZER_ENRICHMENT_FAILURE_REASONS,
  FERTILIZER_ENRICHMENT_FAST_PATH_DECISIONS,
  FERTILIZER_ENRICHMENT_ORCHESTRATION_STATUSES,
  FERTILIZER_ENRICHMENT_ACCESS_CONTEXT_KINDS,
  FERTILIZER_SOURCE_ADAPTER_ERROR_CODES,
  FERTILIZER_SOURCE_ADAPTER_STATUSES,
  FERTILIZER_SOURCE_ADAPTER_TYPES,
  type FertilizerEnrichmentFailedOrchestrationResult,
  type FertilizerEnrichmentIntakeReadyResult,
  type FertilizerEnrichmentNeedsInputResult,
  type FertilizerEnrichmentOrchestrationResultBase,
  type FertilizerEnrichmentTimedOutResult,
  type FertilizerEnrichmentJob,
} from './fertilizerEnrichmentOrchestration'

const orchestrationBase = (
  overrides: Partial<FertilizerEnrichmentOrchestrationResultBase> = {},
): FertilizerEnrichmentOrchestrationResultBase => ({
  orchestrationRunId: 'run-base',
  startedAt: '2026-07-29T10:00:00.000Z',
  attemptedAdapters: [],
  successfulAdapters: [],
  failedAdapters: [],
  timeoutState: {
    kind: 'none',
    startedAt: '2026-07-29T10:00:00.000Z',
    timedOut: false,
    timedOutAdapters: [],
    completedAdapters: [],
    cancelledAdapters: [],
  },
  technicalErrors: [],
  ...overrides,
})

const jobBase = (result: FertilizerEnrichmentJob['result']): FertilizerEnrichmentJob => ({
  jobId: 'job-base',
  orchestrationRunId: result.orchestrationRunId,
  idempotencyKey: 'idem-base',
  accessContext: { kind: 'authenticated_user', userId: 'user-1' },
  objectCategory: 'fertilizer',
  identityFingerprint: 'icl-spring-start',
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:01.000Z',
  result,
})

describe('fertilizerEnrichmentOrchestration types', () => {
  it('T-1 lists all controlled orchestration statuses', () => {
    expect(FERTILIZER_ENRICHMENT_ORCHESTRATION_STATUSES).toEqual([
      'recognized',
      'enriching',
      'needs_input',
      'intake_ready',
      'failed',
      'cancelled',
      'timed_out',
    ])
    expect(new Set(FERTILIZER_ENRICHMENT_ORCHESTRATION_STATUSES).size).toBe(7)
  })

  it('T-2 lists all controlled failure reasons', () => {
    expect(FERTILIZER_ENRICHMENT_FAILURE_REASONS).toEqual([
      'domain_not_ready',
      'technical_failure',
      'no_viable_source',
      'pipeline_failure',
    ])
  })

  it('T-3 lists all controlled adapter types', () => {
    expect(FERTILIZER_SOURCE_ADAPTER_TYPES).toEqual([
      'existing_product_profile',
      'manufacturer_product_page',
      'manufacturer_product_document',
      'manufacturer_catalog',
      'packaging',
      'user_document',
      'supplementary_web',
    ])
  })

  it('T-4 lists all controlled adapter statuses', () => {
    expect(FERTILIZER_SOURCE_ADAPTER_STATUSES).toEqual([
      'success',
      'partial',
      'no_match',
      'unavailable',
      'invalid_source',
      'failed',
    ])
  })

  it('T-5 keeps enrichment, normalization, and readiness versions separate without a new orchestration version', () => {
    expect(FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION).toBe('fertilizer-enrichment-v1')
    expect(FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION).toBe(
      'fertilizer-declaration-normalization-v1',
    )
    expect(FERTILIZER_READINESS_SPECIFICATION_VERSION).toBe('fertilizer-readiness-v1')

    const versions = new Set([
      FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
      FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
      FERTILIZER_READINESS_SPECIFICATION_VERSION,
    ])

    expect(versions.size).toBe(3)
  })

  it('T-6 requires failureReason and matching failureDetail on failed results', () => {
    const failed: FertilizerEnrichmentFailedOrchestrationResult = {
      status: 'failed',
      failureReason: 'domain_not_ready',
      orchestrationRunId: 'run-1',
      startedAt: '2026-07-29T10:00:00.000Z',
      completedAt: '2026-07-29T10:00:05.000Z',
      attemptedAdapters: ['manufacturer_product_page'],
      successfulAdapters: [],
      failedAdapters: [],
      timeoutState: {
        kind: 'none',
        startedAt: '2026-07-29T10:00:00.000Z',
        timedOut: false,
        timedOutAdapters: [],
        completedAdapters: ['manufacturer_product_page'],
        cancelledAdapters: [],
      },
      technicalErrors: [],
      readinessResult: {
        status: 'not_ready',
        missingRequirements: ['identity.fingerprint'],
        fulfilledRequirements: [],
        blockingIssues: [{ code: 'identity.not_actionable' }],
        suggestedInputActions: [],
        evaluatedAt: '2026-07-29T10:00:05.000Z',
        specificationVersion: FERTILIZER_READINESS_SPECIFICATION_VERSION,
      },
    }

    expect(failed.failureReason).toBe('domain_not_ready')
    expect(failed.readinessResult.status).toBe('not_ready')
  })

  it('T-7 requires recommendedNextAction on needs_input results', () => {
    const needsInput: FertilizerEnrichmentNeedsInputResult = {
      status: 'needs_input',
      recommendedNextAction: 'upload_back_photo',
      orchestrationRunId: 'run-2',
      startedAt: '2026-07-29T10:00:00.000Z',
      attemptedAdapters: ['packaging'],
      successfulAdapters: [],
      failedAdapters: [],
      timeoutState: {
        kind: 'none',
        startedAt: '2026-07-29T10:00:00.000Z',
        timedOut: false,
        timedOutAdapters: [],
        completedAdapters: [],
        cancelledAdapters: [],
      },
      technicalErrors: [],
    }

    expect(needsInput.recommendedNextAction).toBe('upload_back_photo')
  })

  it('T-8 requires readiness ready on intake_ready results', () => {
    const intakeReady: FertilizerEnrichmentIntakeReadyResult = {
      status: 'intake_ready',
      orchestrationRunId: 'run-3',
      startedAt: '2026-07-29T10:00:00.000Z',
      attemptedAdapters: ['existing_product_profile'],
      successfulAdapters: ['existing_product_profile'],
      failedAdapters: [],
      timeoutState: {
        kind: 'none',
        startedAt: '2026-07-29T10:00:00.000Z',
        timedOut: false,
        timedOutAdapters: [],
        completedAdapters: ['existing_product_profile'],
        cancelledAdapters: [],
      },
      technicalErrors: [],
      pipelineResult: {
        normalizationResult: {
          status: 'normalized',
          normalizationSpecificationVersion: FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
          normalizedAt: '2026-07-29T10:00:04.000Z',
          normalizationRunId: 'norm-1',
          enrichmentResult: {
            objectCategory: 'fertilizer',
            specificationVersion: FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
            identity: {
              manufacturer: 'ICL',
              officialName: 'Spring Start',
              variant: '15-0-26',
              identityFingerprint: 'icl-spring-start',
              identityConfidence: 0.95,
              hasIdentityAmbiguity: false,
            },
            productForm: { value: 'granular' },
            npk: {
              nitrogen: 15,
              phosphate: 0,
              potash: 26,
              declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
            },
            nutrientMatrix: {} as FertilizerEnrichmentIntakeReadyResult['pipelineResult']['normalizationResult']['enrichmentResult']['nutrientMatrix'],
            declarationEvaluation: { status: 'fully_evaluated' },
            sourceConflicts: [],
            enrichmentRunId: 'enrich-1',
            enrichedAt: '2026-07-29T10:00:03.000Z',
            normalizationRunId: 'norm-1',
            normalizedAt: '2026-07-29T10:00:04.000Z',
            normalizationStatus: 'normalized',
            normalizationRulesVersion: FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
            provenanceRecords: {},
          },
        },
        readinessInput: {
          objectCategory: 'fertilizer',
          identity: {
            manufacturer: 'ICL',
            officialName: 'Spring Start',
            variant: '15-0-26',
            identityFingerprint: 'icl-spring-start',
            identityAmbiguity: { isAmbiguous: false },
          },
          productForm: 'granular',
          npk: {
            nitrogen: 15,
            phosphate: 0,
            potash: 26,
            declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
          },
          nutrientMatrix: {},
          declarationEvaluation: { status: 'fully_evaluated' },
        },
        readinessResult: {
          status: 'ready',
          missingRequirements: [],
          fulfilledRequirements: [],
          blockingIssues: [],
          suggestedInputActions: [],
          evaluatedAt: '2026-07-29T10:00:05.000Z',
          specificationVersion: FERTILIZER_READINESS_SPECIFICATION_VERSION,
        },
      },
    }

    expect(intakeReady.pipelineResult.readinessResult.status).toBe('ready')
  })

  it('T-9 requires timeout metadata on timed_out results without invented readiness', () => {
    const timedOut: FertilizerEnrichmentTimedOutResult = {
      status: 'timed_out',
      orchestrationRunId: 'run-4',
      startedAt: '2026-07-29T10:00:00.000Z',
      attemptedAdapters: ['manufacturer_product_page'],
      successfulAdapters: [],
      failedAdapters: [],
      timeoutState: {
        kind: 'global_timeout',
        startedAt: '2026-07-29T10:00:00.000Z',
        timedOut: true,
        timedOutAdapters: ['manufacturer_product_page'],
        completedAdapters: [],
        cancelledAdapters: ['manufacturer_product_page'],
      },
      technicalErrors: [],
    }

    expect(timedOut.timeoutState.timedOut).toBe(true)
    expect(timedOut).not.toHaveProperty('readinessResult')
    expect(timedOut.pipelineResult).toBeUndefined()
  })

  it('T-10 exposes job status exclusively via result.status', () => {
    const job = jobBase({
      ...orchestrationBase({ orchestrationRunId: 'run-5' }),
      status: 'enriching',
    })

    expect(job.result.status).toBe('enriching')
    expect(FERTILIZER_ENRICHMENT_ORCHESTRATION_STATUSES).toContain(job.result.status)
    expect(job).not.toHaveProperty('status')
  })

  it('T-11 does not import ProductRecognize types in the orchestration module', async () => {
    const source = await import('./fertilizerEnrichmentOrchestration?raw')

    expect(String(source.default)).not.toMatch(/ProductRecognize/)
  })

  it('lists controlled adapter error codes', () => {
    expect(FERTILIZER_SOURCE_ADAPTER_ERROR_CODES).toContain('network_error')
    expect(FERTILIZER_SOURCE_ADAPTER_ERROR_CODES).toContain('timeout')
    expect(FERTILIZER_SOURCE_ADAPTER_ERROR_CODES).toHaveLength(9)
  })

  it('lists controlled fast-path decisions', () => {
    expect(FERTILIZER_ENRICHMENT_FAST_PATH_DECISIONS).toEqual([
      'eligible',
      'ineligible',
      'requires_reenrichment',
    ])
  })

  it('J-1 job with intake_ready carries ready readiness only via result', () => {
    const intakeReadyResult: FertilizerEnrichmentIntakeReadyResult = {
      ...orchestrationBase({ orchestrationRunId: 'run-intake' }),
      status: 'intake_ready',
      pipelineResult: {
        normalizationResult: {
          status: 'normalized',
          normalizationSpecificationVersion: FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
          normalizedAt: '2026-07-29T10:00:04.000Z',
          normalizationRunId: 'norm-1',
          enrichmentResult: {
            objectCategory: 'fertilizer',
            specificationVersion: FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
            identity: {
              manufacturer: 'ICL',
              officialName: 'Spring Start',
              variant: '15-0-26',
              identityFingerprint: 'icl-spring-start',
              identityConfidence: 0.95,
              hasIdentityAmbiguity: false,
            },
            productForm: { value: 'granular' },
            npk: {
              nitrogen: 15,
              phosphate: 0,
              potash: 26,
              declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
            },
            nutrientMatrix: {} as FertilizerEnrichmentIntakeReadyResult['pipelineResult']['normalizationResult']['enrichmentResult']['nutrientMatrix'],
            declarationEvaluation: { status: 'fully_evaluated' },
            sourceConflicts: [],
            enrichmentRunId: 'enrich-1',
            enrichedAt: '2026-07-29T10:00:03.000Z',
            normalizationRunId: 'norm-1',
            normalizedAt: '2026-07-29T10:00:04.000Z',
            normalizationStatus: 'normalized',
            normalizationRulesVersion: FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
            provenanceRecords: {},
          },
        },
        readinessInput: {
          objectCategory: 'fertilizer',
          identity: {
            manufacturer: 'ICL',
            officialName: 'Spring Start',
            variant: '15-0-26',
            identityFingerprint: 'icl-spring-start',
            identityAmbiguity: { isAmbiguous: false },
          },
          productForm: 'granular',
          npk: {
            nitrogen: 15,
            phosphate: 0,
            potash: 26,
            declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
          },
          nutrientMatrix: {},
          declarationEvaluation: { status: 'fully_evaluated' },
        },
        readinessResult: {
          status: 'ready',
          missingRequirements: [],
          fulfilledRequirements: [],
          blockingIssues: [],
          suggestedInputActions: [],
          evaluatedAt: '2026-07-29T10:00:05.000Z',
          specificationVersion: FERTILIZER_READINESS_SPECIFICATION_VERSION,
        },
      },
    }

    const job = jobBase(intakeReadyResult)

    expect(job.result.status).toBe('intake_ready')
    if (job.result.status === 'intake_ready') {
      expect(job.result.pipelineResult.readinessResult.status).toBe('ready')
    }
    expect(job).not.toHaveProperty('pipelineResult')
  })

  it('J-2 job with failed carries failure only via result', () => {
    const failedResult: FertilizerEnrichmentFailedOrchestrationResult = {
      ...orchestrationBase({ orchestrationRunId: 'run-failed' }),
      status: 'failed',
      failureReason: 'domain_not_ready',
      readinessResult: {
        status: 'not_ready',
        missingRequirements: ['identity.fingerprint'],
        fulfilledRequirements: [],
        blockingIssues: [{ code: 'identity.not_actionable' }],
        suggestedInputActions: [],
        evaluatedAt: '2026-07-29T10:00:05.000Z',
        specificationVersion: FERTILIZER_READINESS_SPECIFICATION_VERSION,
      },
    }

    const job = jobBase(failedResult)

    expect(job.result.status).toBe('failed')
    if (job.result.status === 'failed') {
      expect(job.result.failureReason).toBe('domain_not_ready')
      if (job.result.failureReason === 'domain_not_ready') {
        expect(job.result.readinessResult.status).toBe('not_ready')
      }
    }
    expect(job).not.toHaveProperty('failureDetail')
    expect(job).not.toHaveProperty('failureReason')
  })

  it('J-3 job with needs_input carries recommendedNextAction only via result', () => {
    const needsInputResult: FertilizerEnrichmentNeedsInputResult = {
      ...orchestrationBase({ orchestrationRunId: 'run-needs-input' }),
      status: 'needs_input',
      recommendedNextAction: 'upload_back_photo',
    }

    const job = jobBase(needsInputResult)

    expect(job.result.status).toBe('needs_input')
    if (job.result.status === 'needs_input') {
      expect(job.result.recommendedNextAction).toBe('upload_back_photo')
    }
  })

  it('J-4 job with timed_out carries timeout metadata only via result', () => {
    const timedOutResult: FertilizerEnrichmentTimedOutResult = {
      ...orchestrationBase({ orchestrationRunId: 'run-timeout' }),
      status: 'timed_out',
      timeoutState: {
        kind: 'global_timeout',
        startedAt: '2026-07-29T10:00:00.000Z',
        timedOut: true,
        timedOutAdapters: ['manufacturer_product_page'],
        completedAdapters: [],
        cancelledAdapters: ['manufacturer_product_page'],
      },
    }

    const job = jobBase(timedOutResult)

    expect(job.result.status).toBe('timed_out')
    expect(job.result.timeoutState.timedOut).toBe(true)
    expect(job).not.toHaveProperty('timeoutState')
  })

  it('J-5 accepts authenticated_user access context', () => {
    const context = { kind: 'authenticated_user' as const, userId: 'user-42' }

    expect(FERTILIZER_ENRICHMENT_ACCESS_CONTEXT_KINDS).toContain(context.kind)
    expect(context.userId).toBe('user-42')
  })

  it('J-6 accepts session access context', () => {
    const context = { kind: 'session' as const, sessionId: 'session-42' }

    expect(FERTILIZER_ENRICHMENT_ACCESS_CONTEXT_KINDS).toContain(context.kind)
    expect(context.sessionId).toBe('session-42')
  })

  it('J-7 job has no duplicate orchestration state fields', () => {
    type DuplicateJobStateKey =
      | 'status'
      | 'failureDetail'
      | 'failureReason'
      | 'retryState'
      | 'timeoutState'
      | 'pipelineResult'
      | 'orchestrationResult'
      | 'attemptedAdapters'
      | 'startedAt'
      | 'completedAt'
      | 'rawDeclarationSnapshot'
      | 'userId'
      | 'sessionId'
      | 'recommendedNextAction'
      | 'lastOrchestrationInput'
      | 'lastSourceProvisionIdempotencyKey'
      | 'orchestrationInput'

    type AssertJobHasNoDuplicateStateKeys =
      DuplicateJobStateKey extends keyof FertilizerEnrichmentJob ? never : true

    const assertJobHasNoDuplicateStateKeys: AssertJobHasNoDuplicateStateKeys = true

    expect(assertJobHasNoDuplicateStateKeys).toBe(true)
    expect(Object.keys(jobBase({ ...orchestrationBase(), status: 'enriching' }))).toEqual([
      'jobId',
      'orchestrationRunId',
      'idempotencyKey',
      'accessContext',
      'objectCategory',
      'identityFingerprint',
      'createdAt',
      'updatedAt',
      'result',
    ])
  })

  it('T-API lists controlled API error codes including Phase 4d codes', () => {
    expect(FERTILIZER_ENRICHMENT_API_ERROR_CODES).toEqual(
      expect.arrayContaining(['job_expired', 'idempotency_conflict', 'revision_conflict']),
    )
  })
})
