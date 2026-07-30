import { describe, expect, it } from 'vitest'
import type {
  FertilizerEnrichmentJob,
  FertilizerEnrichmentOrchestrationResult,
} from '../types/fertilizerEnrichmentOrchestration'
import { createFertilizerEnrichmentRetentionPolicy } from './fertilizerEnrichmentRetentionPolicyCore'

const POLICY = {
  continuableDays: 7,
  sessionMaxHours: 72,
  terminalDays: 30,
  intakeReadyDays: 14,
}

const CREATED_AT = '2026-07-01T10:00:00.000Z'
const NOW = '2026-07-02T10:00:00.000Z'

function resultBase(
  status: FertilizerEnrichmentOrchestrationResult['status'],
): FertilizerEnrichmentOrchestrationResult {
  return {
    orchestrationRunId: 'orch-1',
    startedAt: CREATED_AT,
    completedAt: status === 'needs_input' ? null : CREATED_AT,
    attemptedAdapters: [],
    successfulAdapters: [],
    failedAdapters: [],
    timeoutState: {
      kind: 'none',
      startedAt: CREATED_AT,
      timedOut: false,
      timedOutAdapters: [],
      completedAdapters: [],
      cancelledAdapters: [],
    },
    technicalErrors: [],
    status,
    recommendedNextAction: 'upload_product_document',
  } as FertilizerEnrichmentOrchestrationResult
}

function buildJob(overrides: Partial<FertilizerEnrichmentJob> = {}): FertilizerEnrichmentJob {
  const status = overrides.result?.status ?? 'needs_input'

  return {
    jobId: 'job-1',
    orchestrationRunId: 'orch-1',
    idempotencyKey: 'idem-1',
    accessContext: overrides.accessContext ?? {
      kind: 'authenticated_user',
      userId: 'user-1',
    },
    objectCategory: 'fertilizer',
    identityFingerprint: 'fp-1',
    createdAt: CREATED_AT,
    updatedAt: overrides.updatedAt ?? CREATED_AT,
    expiresAt: overrides.expiresAt,
    result: overrides.result ?? resultBase(status),
    ...overrides,
  }
}

describe('fertilizerEnrichmentRetentionPolicyCore', () => {
  const resolveExpiresAt = createFertilizerEnrichmentRetentionPolicy(POLICY)

  it('RT-1: start receives continuable expiresAt from now', () => {
    const expiresAt = resolveExpiresAt(buildJob(), NOW)
    expect(expiresAt).toBe('2026-07-09T10:00:00.000Z')
  })

  it('RT-2: successful mutation receives policy-based expiresAt', () => {
    const expiresAt = resolveExpiresAt(
      buildJob({
        updatedAt: '2026-07-05T10:00:00.000Z',
        result: resultBase('intake_ready'),
      }),
      NOW,
    )
    expect(expiresAt).toBe('2026-07-19T10:00:00.000Z')
  })

  it('RT-3: expired job is not extended', () => {
    const expiredAt = '2026-07-01T11:00:00.000Z'
    const expiresAt = resolveExpiresAt(buildJob({ expiresAt: expiredAt }), NOW)
    expect(expiresAt).toBe(expiredAt)
  })

  it('RT-4: policy is deterministic for given job and now', () => {
    const job = buildJob({
      updatedAt: '2026-07-03T10:00:00.000Z',
      result: resultBase('failed'),
    })
    expect(resolveExpiresAt(job, NOW)).toBe(resolveExpiresAt(job, NOW))
    expect(resolveExpiresAt(job, NOW)).toBe('2026-08-02T10:00:00.000Z')
  })

  it('RT-5: session access applies 72h cap from createdAt', () => {
    const expiresAt = resolveExpiresAt(
      buildJob({
        accessContext: { kind: 'session', sessionId: 'session-1' },
      }),
      NOW,
    )

    expect(expiresAt).toBe('2026-07-04T10:00:00.000Z')
  })
})
