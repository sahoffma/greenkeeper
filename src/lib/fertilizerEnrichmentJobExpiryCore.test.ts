import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentJob } from '../types/fertilizerEnrichmentOrchestration'
import {
  assertFertilizerEnrichmentJobNotExpired,
  FertilizerEnrichmentJobExpiryError,
} from './fertilizerEnrichmentJobExpiryCore'

const NOW = '2026-07-29T10:00:00.000Z'

function buildJob(expiresAt: string | null | undefined): FertilizerEnrichmentJob {
  return {
    jobId: 'job-1',
    orchestrationRunId: 'orch-1',
    idempotencyKey: 'idem-1',
    accessContext: { kind: 'session', sessionId: 'session-1' },
    objectCategory: 'fertilizer',
    identityFingerprint: 'fp-1',
    createdAt: '2026-07-28T10:00:00.000Z',
    updatedAt: NOW,
    expiresAt,
    result: {
      orchestrationRunId: 'orch-1',
      startedAt: NOW,
      completedAt: NOW,
      attemptedAdapters: [],
      successfulAdapters: [],
      failedAdapters: [],
      timeoutState: {
        kind: 'none',
        startedAt: NOW,
        timedOut: false,
        timedOutAdapters: [],
        completedAdapters: [],
        cancelledAdapters: [],
      },
      technicalErrors: [],
      status: 'needs_input',
      recommendedNextAction: 'upload_product_document',
    },
  }
}

describe('fertilizerEnrichmentJobExpiryCore', () => {
  it('EX-5: expiresAt equal to now is expired', () => {
    expect(() => assertFertilizerEnrichmentJobNotExpired(buildJob(NOW), NOW)).toThrow(
      FertilizerEnrichmentJobExpiryError,
    )
  })

  it('EX-6: future expiresAt is allowed', () => {
    expect(() =>
      assertFertilizerEnrichmentJobNotExpired(buildJob('2026-08-01T10:00:00.000Z'), NOW),
    ).not.toThrow()
  })

  it('EX-7: missing expiresAt is invalid, not expired', () => {
    expect(() => assertFertilizerEnrichmentJobNotExpired(buildJob(undefined), NOW)).toThrow(
      expect.objectContaining({ kind: 'invalid_expires_at' }),
    )
  })
})
