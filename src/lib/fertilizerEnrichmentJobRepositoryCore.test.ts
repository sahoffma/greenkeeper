import { describe, expect, it } from 'vitest'
import type {
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentJob,
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentOrchestrationResult,
  FertilizerEnrichmentTimeoutState,
} from '../types/fertilizerEnrichmentOrchestration'
import {
  accessContextsMatch,
  assertPublicFertilizerEnrichmentJobShape,
  createInMemoryFertilizerEnrichmentJobRepository,
  PUBLIC_FERTILIZER_ENRICHMENT_JOB_KEYS,
  type FertilizerEnrichmentJobRecord,
} from './fertilizerEnrichmentJobRepositoryCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'

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

function orchestrationBase(): FertilizerEnrichmentOrchestrationResult {
  return {
    orchestrationRunId: 'orch-1',
    startedAt: FIXED_NOW,
    completedAt: FIXED_NOW,
    attemptedAdapters: [],
    successfulAdapters: [],
    failedAdapters: [],
    timeoutState: emptyTimeoutState(),
    technicalErrors: [],
    status: 'needs_input',
    recommendedNextAction: 'upload_product_document',
  }
}

function buildInput(): FertilizerEnrichmentOrchestrationInput {
  return {
    objectCategory: 'fertilizer',
    identity: {
      manufacturer: 'ICL',
      officialName: 'Spring Start',
      productLine: null,
      variant: '15-0-26',
      identityFingerprint: 'fp-1',
      identityConfidence: 1,
      hasIdentityAmbiguity: false,
    },
    allowedInputChannels: ['capture_flow'],
    sourceHints: [{ referenceId: 'doc-1', adapterType: 'user_document', hintType: 'user' }],
  }
}

function buildJob(
  overrides: Partial<FertilizerEnrichmentJob> = {},
  accessContext: FertilizerEnrichmentAccessContext = { kind: 'session', sessionId: 'session-1' },
): FertilizerEnrichmentJob {
  return {
    jobId: 'job-1',
    orchestrationRunId: 'orch-1',
    idempotencyKey: 'idem-1',
    accessContext,
    objectCategory: 'fertilizer',
    identityFingerprint: 'fp-1',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    result: orchestrationBase(),
    ...overrides,
  }
}

function buildRecord(overrides: Partial<FertilizerEnrichmentJobRecord> = {}): FertilizerEnrichmentJobRecord {
  return {
    job: buildJob(),
    orchestrationInput: buildInput(),
    lastSourceProvisionIdempotencyKey: 'source-idem-1',
    ...overrides,
  }
}

describe('fertilizerEnrichmentJobRepositoryCore', () => {
  it('RR-1: save and get preserves job, orchestrationInput, and provision metadata', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    const record = buildRecord()

    await repository.save(record)
    const loaded = await repository.getByJobId('job-1')

    expect(loaded?.job).toEqual(record.job)
    expect(loaded?.orchestrationInput).toEqual(record.orchestrationInput)
    expect(loaded?.lastSourceProvisionIdempotencyKey).toBe('source-idem-1')
  })

  it('RR-2: public job in record does not expose internal record fields', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(buildRecord())
    const loaded = await repository.getByJobId('job-1')

    expect(() => assertPublicFertilizerEnrichmentJobShape(loaded!.job)).not.toThrow()
    expect(Object.keys(loaded!.job).sort()).toEqual(
      [...PUBLIC_FERTILIZER_ENRICHMENT_JOB_KEYS].sort().filter((key) => key !== 'expiresAt'),
    )
    expect(loaded!.job).not.toHaveProperty('orchestrationInput')
    expect(loaded!.job).not.toHaveProperty('lastOrchestrationInput')
    expect(loaded!.job).not.toHaveProperty('lastSourceProvisionIdempotencyKey')
  })

  it('RR-3: idempotency lookup uses record.job idempotency key and access context', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(buildRecord())

    const loaded = await repository.findByIdempotencyKey('idem-1', {
      kind: 'session',
      sessionId: 'session-1',
    })

    expect(loaded?.job.jobId).toBe('job-1')
  })

  it('R-3: same idempotency key with different access context does not find record', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(buildRecord())

    const loaded = await repository.findByIdempotencyKey('idem-1', {
      kind: 'session',
      sessionId: 'session-2',
    })

    expect(loaded).toBeNull()
  })

  it('RR-4: update replaces full record and keeps result canonical on job', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save(buildRecord())

    const updated = buildRecord({
      job: buildJob({
        result: {
          ...orchestrationBase(),
          status: 'cancelled',
          cancellation: {
            reason: 'user_cancelled',
            cancelledAt: FIXED_NOW,
            cancelledBy: 'user',
          },
        },
      }),
      lastSourceProvisionIdempotencyKey: 'source-idem-2',
    })

    await repository.update(updated)
    const loaded = await repository.getByJobId('job-1')

    expect(loaded?.job.result.status).toBe('cancelled')
    expect(loaded?.lastSourceProvisionIdempotencyKey).toBe('source-idem-2')
  })

  it('RR-5: repository does not mutate saved record or orchestrationInput', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    const record = buildRecord()
    const snapshot = structuredClone(record)

    await repository.save(record)
    record.job.jobId = 'mutated'
    record.orchestrationInput.sourceHints = []

    const loaded = await repository.getByJobId('job-1')
    expect(loaded?.job.jobId).toBe('job-1')
    expect(loaded?.orchestrationInput.sourceHints).toHaveLength(1)
    expect(snapshot.job.jobId).toBe('job-1')
  })

  it('accessContextsMatch compares authenticated users deterministically', () => {
    expect(
      accessContextsMatch(
        { kind: 'authenticated_user', userId: 'user-1' },
        { kind: 'authenticated_user', userId: 'user-1' },
      ),
    ).toBe(true)

    expect(
      accessContextsMatch(
        { kind: 'authenticated_user', userId: 'user-1' },
        { kind: 'authenticated_user', userId: 'user-2' },
      ),
    ).toBe(false)
  })
})
