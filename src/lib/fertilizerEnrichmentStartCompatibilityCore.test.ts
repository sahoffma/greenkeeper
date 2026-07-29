import { describe, expect, it } from 'vitest'
import type {
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentOrchestrationInput,
} from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerEnrichmentJobRecord } from './fertilizerEnrichmentJobRepositoryCore'
import {
  assertCompatibleFertilizerEnrichmentStart,
  areFertilizerEnrichmentStartsCompatible,
  FertilizerEnrichmentStartCompatibilityError,
} from './fertilizerEnrichmentStartCompatibilityCore'

const ACCESS: FertilizerEnrichmentAccessContext = { kind: 'session', sessionId: 'session-1' }
const FIXED_NOW = '2026-07-29T10:00:00.000Z'

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
    references: {
      recognitionCandidateId: 'rec-1',
      correlationId: 'corr-1',
    },
    ...overrides,
  }
}

function buildRecord(
  overrides: Partial<FertilizerEnrichmentJobRecord> = {},
): FertilizerEnrichmentJobRecord {
  const input = buildInput()
  return {
    job: {
      jobId: 'job-1',
      orchestrationRunId: 'orch-1',
      idempotencyKey: 'idem-1',
      accessContext: ACCESS,
      objectCategory: 'fertilizer',
      identityFingerprint: 'icl-spring-start-15-0-26',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      expiresAt: '2026-08-05T10:00:00.000Z',
      result: {
        orchestrationRunId: 'orch-1',
        startedAt: FIXED_NOW,
        completedAt: FIXED_NOW,
        attemptedAdapters: [],
        successfulAdapters: [],
        failedAdapters: [],
        timeoutState: {
          kind: 'none',
          startedAt: FIXED_NOW,
          timedOut: false,
          timedOutAdapters: [],
          completedAdapters: [],
          cancelledAdapters: [],
        },
        technicalErrors: [],
        status: 'needs_input',
        recommendedNextAction: 'upload_product_document',
      },
    },
    orchestrationInput: input,
    lastSourceProvisionIdempotencyKey: null,
    recordSchemaVersion: 1,
    revision: 1,
    ...overrides,
  }
}

describe('fertilizerEnrichmentStartCompatibilityCore', () => {
  it('SI-6: additional sources in stored input do not break compatibility', () => {
    const record = buildRecord({
      orchestrationInput: buildInput({
        userProvidedSources: [{ kind: 'product_document', referenceId: 'doc-1' }],
        sourceHints: [{ referenceId: 'doc-1', adapterType: 'user_document', hintType: 'user' }],
      }),
    })

    expect(
      areFertilizerEnrichmentStartsCompatible(record, buildInput(), ACCESS),
    ).toBe(true)
  })

  it('SI-7: different identity fingerprint is incompatible', () => {
    const record = buildRecord()
    expect(() =>
      assertCompatibleFertilizerEnrichmentStart(
        record,
        buildInput({
          identity: {
            ...buildInput().identity,
            identityFingerprint: 'other-fingerprint',
          },
        }),
        ACCESS,
      ),
    ).toThrow(FertilizerEnrichmentStartCompatibilityError)
  })

  it('SI-8: different object category is incompatible', () => {
    const record = buildRecord()
    expect(() =>
      assertCompatibleFertilizerEnrichmentStart(
        record,
        buildInput({ objectCategory: 'tool' as 'fertilizer' }),
        ACCESS,
      ),
    ).toThrow(FertilizerEnrichmentStartCompatibilityError)
  })

  it('SI-9: different correlationId remains compatible', () => {
    const record = buildRecord({
      orchestrationInput: buildInput({
        references: {
          recognitionCandidateId: 'rec-1',
          correlationId: 'corr-stored',
        },
      }),
    })

    expect(
      areFertilizerEnrichmentStartsCompatible(
        record,
        buildInput({
          references: {
            recognitionCandidateId: 'rec-1',
            correlationId: 'corr-new',
          },
        }),
        ACCESS,
      ),
    ).toBe(true)
  })
})
