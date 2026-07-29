import { describe, expect, it } from 'vitest'
import type {
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentJob,
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentOrchestrationResult,
} from '../types/fertilizerEnrichmentOrchestration'
import { createDeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import {
  mapRecordToRow,
  mapRowToRecord,
  persistedJobJsonHasNoRawSessionId,
  persistedOrchestrationInputHasNoRawSessionId,
  resolveRecordExpiresAt,
  sanitizeJobForPersistence,
  sanitizeOrchestrationInputForPersistence,
  validateFertilizerEnrichmentJobRecord,
} from './fertilizerEnrichmentJobRepositoryMappingCore'
import { FertilizerEnrichmentJobRepositoryError } from './fertilizerEnrichmentJobRepositoryCore'
import type { FertilizerEnrichmentJobRecord } from './fertilizerEnrichmentJobRepositoryCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const TEST_EXPIRES_AT = '2026-08-05T10:00:00.000Z'
const SECRET = 'mapping-test-secret'
const deriveHash = createDeriveSessionAccessHash(SECRET)
const SESSION_ACCESS: FertilizerEnrichmentAccessContext = { kind: 'session', sessionId: 'session-1' }
const AUTH_ACCESS: FertilizerEnrichmentAccessContext = {
  kind: 'authenticated_user',
  userId: '00000000-0000-4000-8000-000000000001',
}

function resultBase(): FertilizerEnrichmentOrchestrationResult {
  return {
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
    references: {
      sessionId: 'session-1',
      correlationId: 'corr-1',
    },
    allowedInputChannels: ['capture_flow'],
    sourceHints: [
      {
        sourceUrl: 'https://example.com/doc?token=secret-value',
        referenceId: 'doc-1',
        adapterType: 'user_document',
      },
    ],
  }
}

function buildJob(
  accessContext: FertilizerEnrichmentAccessContext = SESSION_ACCESS,
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
    expiresAt: TEST_EXPIRES_AT,
    result: resultBase(),
  }
}

function buildRecord(
  overrides: Partial<FertilizerEnrichmentJobRecord> = {},
): FertilizerEnrichmentJobRecord {
  return {
    job: buildJob(),
    orchestrationInput: buildInput(),
    lastSourceProvisionIdempotencyKey: null,
    recordSchemaVersion: 1,
    revision: 1,
    ...overrides,
  }
}

describe('fertilizerEnrichmentJobRepositoryMappingCore', () => {
  it('M-1: sanitizeJobForPersistence removes sessionId from session accessContext', () => {
    const sanitized = sanitizeJobForPersistence(buildJob())
    expect(sanitized.accessContext).toEqual({ kind: 'session' })
    expect(JSON.stringify(sanitized)).not.toContain('session-1')
  })

  it('M-2: sanitizeOrchestrationInputForPersistence removes references.sessionId', () => {
    const sanitized = sanitizeOrchestrationInputForPersistence(buildInput())
    expect(sanitized.references?.sessionId).toBeUndefined()
    expect(sanitized.references?.correlationId).toBe('corr-1')
  })

  it('M-3: sanitizeOrchestrationInputForPersistence strips sensitive URL query params', () => {
    const sanitized = sanitizeOrchestrationInputForPersistence(buildInput())
    expect(sanitized.sourceHints?.[0]?.sourceUrl).toBe('https://example.com/doc')
  })

  it('M-4: mapRecordToRow stores session_access_hash instead of raw session id', () => {
    const row = mapRecordToRow(buildRecord(), deriveHash)

    expect(row.session_access_hash).toBe(deriveHash('session-1'))
    expect(row.user_id).toBeNull()
    expect(persistedJobJsonHasNoRawSessionId(row.job_json)).toBe(true)
    expect(persistedOrchestrationInputHasNoRawSessionId(row.orchestration_input_json)).toBe(true)
  })

  it('M-5: mapRowToRecord rebuilds public session accessContext from request context', () => {
    const row = mapRecordToRow(buildRecord(), deriveHash)
    const record = mapRowToRecord(row, SESSION_ACCESS, deriveHash)

    expect(record.job.accessContext).toEqual(SESSION_ACCESS)
    expect(record.revision).toBe(1)
  })

  it('M-6: mapRowToRecord rejects mismatched session access context', () => {
    const row = mapRecordToRow(buildRecord(), deriveHash)

    expect(() =>
      mapRowToRecord(row, { kind: 'session', sessionId: 'session-2' }, deriveHash),
    ).toThrow(FertilizerEnrichmentJobRepositoryError)
  })

  it('M-7: authenticated mapping stores user_id and no session hash', () => {
    const row = mapRecordToRow(buildRecord({ job: buildJob(AUTH_ACCESS) }), deriveHash)

    expect(row.access_kind).toBe('authenticated_user')
    expect(row.user_id).toBe(AUTH_ACCESS.userId)
    expect(row.session_access_hash).toBeNull()
  })

  it('M-9: validateFertilizerEnrichmentJobRecord rejects empty provision key', () => {
    expect(() =>
      validateFertilizerEnrichmentJobRecord({
        ...buildRecord(),
        lastSourceProvisionIdempotencyKey: '   ',
      }),
    ).toThrow(FertilizerEnrichmentJobRepositoryError)
  })

  describe('retention boundary', () => {
    it('RT-1: mapRecordToRow uses pre-set expiresAt unchanged', () => {
      const row = mapRecordToRow(buildRecord(), deriveHash)
      expect(row.expires_at).toBe(TEST_EXPIRES_AT)
    })

    it('RT-2: mapRecordToRow does not derive retention from status or access', () => {
      const terminalRecord = buildRecord({
        job: {
          ...buildJob(),
          expiresAt: '2026-09-01T10:00:00.000Z',
          result: {
            ...resultBase(),
            status: 'cancelled',
            cancellation: {
              reason: 'user_cancelled',
              cancelledAt: FIXED_NOW,
              cancelledBy: 'user',
            },
          },
        },
      })

      const row = mapRecordToRow(terminalRecord, deriveHash)
      expect(row.expires_at).toBe('2026-09-01T10:00:00.000Z')
    })

    it('RT-3: missing expiresAt fails mapping validation', () => {
      expect(() =>
        mapRecordToRow(
          buildRecord({
            job: {
              ...buildJob(),
              expiresAt: undefined,
            },
          }),
          deriveHash,
        ),
      ).toThrow(FertilizerEnrichmentJobRepositoryError)
    })

    it('RT-4: expiresAt before createdAt is rejected', () => {
      expect(() =>
        resolveRecordExpiresAt(
          buildRecord({
            job: {
              ...buildJob(),
              expiresAt: '2026-07-28T10:00:00.000Z',
            },
          }),
        ),
      ).toThrow(FertilizerEnrichmentJobRepositoryError)
    })
  })
})
