import type {
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentJob,
  FertilizerEnrichmentOrchestrationInput,
} from '../types/fertilizerEnrichmentOrchestration'

/** Server-internal enrichment job envelope — not part of the public API contract. */
export interface FertilizerEnrichmentJobRecord {
  job: FertilizerEnrichmentJob
  orchestrationInput: FertilizerEnrichmentOrchestrationInput
  lastSourceProvisionIdempotencyKey?: string | null
  recordSchemaVersion: number
  revision: number
}

export const FERTILIZER_ENRICHMENT_JOB_REPOSITORY_ERROR_CODES = [
  'revision_conflict',
  'invalid_stored_record',
  'persistence_unavailable',
  'idempotency_conflict',
] as const

export type FertilizerEnrichmentJobRepositoryErrorCode =
  (typeof FERTILIZER_ENRICHMENT_JOB_REPOSITORY_ERROR_CODES)[number]

export class FertilizerEnrichmentJobRepositoryError extends Error {
  readonly code: FertilizerEnrichmentJobRepositoryErrorCode

  constructor(code: FertilizerEnrichmentJobRepositoryErrorCode, message: string) {
    super(message)
    this.name = 'FertilizerEnrichmentJobRepositoryError'
    this.code = code
  }
}

export interface FertilizerEnrichmentJobRepository {
  getByJobId(
    jobId: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerEnrichmentJobRecord | null>
  findByIdempotencyKey(
    idempotencyKey: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerEnrichmentJobRecord | null>
  save(record: FertilizerEnrichmentJobRecord): Promise<FertilizerEnrichmentJobRecord>
  update(record: FertilizerEnrichmentJobRecord): Promise<FertilizerEnrichmentJobRecord>
  deleteExpired?(now: string): Promise<number>
}

export interface InMemoryFertilizerEnrichmentJobRepositoryState {
  byJobId: Map<string, FertilizerEnrichmentJobRecord>
  byIdempotencyKey: Map<string, string>
}

function idempotencyLookupKey(
  idempotencyKey: string,
  accessContext: FertilizerEnrichmentAccessContext,
): string {
  if (accessContext.kind === 'authenticated_user') {
    return `user:${accessContext.userId}:${idempotencyKey}`
  }

  return `session:${accessContext.sessionId}:${idempotencyKey}`
}

function cloneRecord(record: FertilizerEnrichmentJobRecord): FertilizerEnrichmentJobRecord {
  return structuredClone(record)
}

function normalizeRecord(record: FertilizerEnrichmentJobRecord): FertilizerEnrichmentJobRecord {
  return {
    ...cloneRecord(record),
    recordSchemaVersion: record.recordSchemaVersion ?? 1,
    revision: record.revision ?? 1,
  }
}

export function createInMemoryFertilizerEnrichmentJobRepository(
  initialState?: Partial<InMemoryFertilizerEnrichmentJobRepositoryState>,
): FertilizerEnrichmentJobRepository & {
  state: InMemoryFertilizerEnrichmentJobRepositoryState
} {
  const state: InMemoryFertilizerEnrichmentJobRepositoryState = {
    byJobId: initialState?.byJobId ?? new Map(),
    byIdempotencyKey: initialState?.byIdempotencyKey ?? new Map(),
  }

  return {
    state,
    async getByJobId(jobId, accessContext) {
      const record = state.byJobId.get(jobId)
      if (!record || !accessContextsMatch(record.job.accessContext, accessContext)) {
        return null
      }

      return cloneRecord(record)
    },
    async findByIdempotencyKey(idempotencyKey, accessContext) {
      const jobId = state.byIdempotencyKey.get(idempotencyLookupKey(idempotencyKey, accessContext))
      if (!jobId) {
        return null
      }

      const record = state.byJobId.get(jobId)
      return record ? cloneRecord(record) : null
    },
    async save(record) {
      const snapshot = normalizeRecord(record)
      state.byJobId.set(snapshot.job.jobId, snapshot)
      state.byIdempotencyKey.set(
        idempotencyLookupKey(snapshot.job.idempotencyKey, snapshot.job.accessContext),
        snapshot.job.jobId,
      )
      return cloneRecord(snapshot)
    },
    async update(record) {
      const existing = state.byJobId.get(record.job.jobId)
      if (!existing) {
        throw new FertilizerEnrichmentJobRepositoryError(
          'invalid_stored_record',
          `Job "${record.job.jobId}" was not found for update.`,
        )
      }

      if (existing.revision !== record.revision) {
        throw new FertilizerEnrichmentJobRepositoryError(
          'revision_conflict',
          `Job "${record.job.jobId}" revision conflict.`,
        )
      }

      const snapshot = normalizeRecord({
        ...record,
        revision: record.revision + 1,
      })
      state.byJobId.set(snapshot.job.jobId, snapshot)
      state.byIdempotencyKey.set(
        idempotencyLookupKey(snapshot.job.idempotencyKey, snapshot.job.accessContext),
        snapshot.job.jobId,
      )
      return cloneRecord(snapshot)
    },
    async deleteExpired(now) {
      let removed = 0
      for (const [jobId, record] of state.byJobId.entries()) {
        if (record.job.expiresAt && record.job.expiresAt <= now) {
          state.byJobId.delete(jobId)
          state.byIdempotencyKey.delete(
            idempotencyLookupKey(record.job.idempotencyKey, record.job.accessContext),
          )
          removed += 1
        }
      }
      return removed
    },
  }
}

export function accessContextsMatch(
  stored: FertilizerEnrichmentAccessContext,
  requested: FertilizerEnrichmentAccessContext,
): boolean {
  if (stored.kind !== requested.kind) {
    return false
  }

  if (stored.kind === 'authenticated_user' && requested.kind === 'authenticated_user') {
    return stored.userId === requested.userId
  }

  if (stored.kind === 'session' && requested.kind === 'session') {
    return stored.sessionId === requested.sessionId
  }

  return false
}

export const PUBLIC_FERTILIZER_ENRICHMENT_JOB_KEYS = [
  'jobId',
  'orchestrationRunId',
  'idempotencyKey',
  'accessContext',
  'objectCategory',
  'identityFingerprint',
  'createdAt',
  'updatedAt',
  'expiresAt',
  'result',
] as const

export const INTERNAL_FERTILIZER_ENRICHMENT_JOB_LEAKAGE_KEYS = [
  'orchestrationInput',
  'lastOrchestrationInput',
  'lastSourceProvisionIdempotencyKey',
  'recordSchemaVersion',
  'revision',
] as const

export function assertPublicFertilizerEnrichmentJobShape(job: FertilizerEnrichmentJob): void {
  const keys = Object.keys(job)
  for (const internalKey of INTERNAL_FERTILIZER_ENRICHMENT_JOB_LEAKAGE_KEYS) {
    if (keys.includes(internalKey)) {
      throw new Error(`Public job must not expose internal field "${internalKey}".`)
    }
  }
}

export function serializedPublicJobHasNoInternalLeakage(value: unknown): boolean {
  const serialized = JSON.stringify(value)
  return INTERNAL_FERTILIZER_ENRICHMENT_JOB_LEAKAGE_KEYS.every(
    (internalKey) => !serialized.includes(`"${internalKey}"`),
  )
}
