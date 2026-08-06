import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentJob,
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentOrchestrationResult,
} from '../types/fertilizerEnrichmentOrchestration'
import { createDeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import {
  FERTILIZER_ENRICHMENT_JOBS_TABLE,
  mapRecordToRow,
  type FertilizerEnrichmentJobRow,
} from './fertilizerEnrichmentJobRepositoryMappingCore'
import { FertilizerEnrichmentJobRepositoryError } from './fertilizerEnrichmentJobRepositoryCore'
import { createPersistentFertilizerEnrichmentJobRepository } from './fertilizerEnrichmentJobRepositoryPersistentCore'
import {
  createFertilizerEnrichmentServerService,
  createTestOrchestrationDependencies,
  createTestResolveExpiresAt,
} from './fertilizerEnrichmentServerServiceCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const TEST_EXPIRES_AT = '2026-08-05T10:00:00.000Z'
const SECRET = 'persistent-test-secret'
const deriveHash = createDeriveSessionAccessHash(SECRET)
const SESSION_ACCESS: FertilizerEnrichmentAccessContext = { kind: 'session', sessionId: 'session-1' }

type QueryMode = 'select' | 'insert' | 'update' | 'delete'

interface CapturedQuery {
  mode: QueryMode
  filters: Array<[string, unknown]>
  values?: Record<string, unknown>
}

interface FakeSupabaseOptions {
  duplicateConstraint?: string
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
    allowedInputChannels: ['capture_flow'],
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

function buildRecord(revision = 1) {
  return {
    job: buildJob(),
    orchestrationInput: buildInput(),
    lastSourceProvisionIdempotencyKey: null,
    recordSchemaVersion: 1,
    revision,
  }
}

function matchesFilters(
  row: FertilizerEnrichmentJobRow,
  eqFilters: Array<[string, unknown]>,
  lteFilters: Array<[string, unknown]>,
): boolean {
  const eqMatch = eqFilters.every(([column, value]) => (row as unknown as Record<string, unknown>)[column] === value)
  const lteMatch = lteFilters.every(([column, value]) => {
    const rowValue = (row as unknown as Record<string, unknown>)[column]
    if (typeof rowValue === 'string' && typeof value === 'string') {
      return rowValue <= value
    }
    return rowValue === value
  })
  return eqMatch && lteMatch
}

function idempotencyConstraintForRow(row: Pick<FertilizerEnrichmentJobRow, 'access_kind'>) {
  return row.access_kind === 'session'
    ? 'fertilizer_enrichment_jobs_session_idempotency_idx'
    : 'fertilizer_enrichment_jobs_auth_idempotency_idx'
}

function createFakeSupabaseClient(
  initialRows: FertilizerEnrichmentJobRow[] = [],
  options: FakeSupabaseOptions = {},
) {
  const rows = [...initialRows]
  const queries: CapturedQuery[] = []

  class FakeQueryBuilder {
    private mode: QueryMode = 'select'
    private eqFilters: Array<[string, unknown]> = []
    private lteFilters: Array<[string, unknown]> = []
    private values: Record<string, unknown> | null = null

    constructor(private readonly table: string) {}

    select(columns = '*') {
      void columns
      return this
    }

    insert(values: Record<string, unknown> | Record<string, unknown>[]) {
      this.mode = 'insert'
      this.values = Array.isArray(values) ? values[0] : values
      return this
    }

    update(values: Record<string, unknown>) {
      this.mode = 'update'
      this.values = values
      return this
    }

    delete() {
      this.mode = 'delete'
      return this
    }

    eq(column: string, value: unknown) {
      this.eqFilters.push([column, value])
      return this
    }

    lte(column: string, value: unknown) {
      this.lteFilters.push([column, value])
      return this
    }

    single() {
      return this.execute(true)
    }

    maybeSingle() {
      return this.execute(false)
    }

    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return this.execute(false).then(onFulfilled, onRejected)
    }

    private async execute(requireSingle: boolean) {
      if (this.table !== FERTILIZER_ENRICHMENT_JOBS_TABLE) {
        return { data: null, error: { message: 'Unknown table' } }
      }

      queries.push({
        mode: this.mode,
        filters: [...this.eqFilters, ...this.lteFilters.map(([column, value]) => [`lte:${column}`, value] as [string, unknown])],
        values: this.values ?? undefined,
      })

      if (this.mode === 'insert' && this.values) {
        const duplicate = rows.find(
          (row) =>
            row.idempotency_key === this.values!.idempotency_key &&
            row.access_kind === this.values!.access_kind &&
            ((row.access_kind === 'session' &&
              row.session_access_hash === this.values!.session_access_hash) ||
              (row.access_kind === 'authenticated_user' && row.user_id === this.values!.user_id)),
        )

        const duplicateJobId = rows.find((row) => row.job_id === this.values!.job_id)

        if (duplicateJobId && options.duplicateConstraint === 'fertilizer_enrichment_jobs_pkey') {
          return {
            data: null,
            error: {
              code: '23505',
              message:
                'duplicate key value violates unique constraint "fertilizer_enrichment_jobs_pkey"',
            },
          }
        }

        if (duplicate) {
          const constraint =
            options.duplicateConstraint ??
            idempotencyConstraintForRow({
              access_kind: this.values!.access_kind as FertilizerEnrichmentJobRow['access_kind'],
            })
          return {
            data: null,
            error: {
              code: '23505',
              message: `duplicate key value violates unique constraint "${constraint}"`,
            },
          }
        }

        const inserted = {
          ...(this.values as unknown as FertilizerEnrichmentJobRow),
          created_at: FIXED_NOW,
          updated_at: FIXED_NOW,
        }
        rows.push(inserted)
        return { data: inserted, error: null }
      }

      if (this.mode === 'update' && this.values) {
        const index = rows.findIndex((row) => matchesFilters(row, this.eqFilters, this.lteFilters))
        if (index === -1) {
          return { data: null, error: null }
        }

        rows[index] = {
          ...rows[index],
          ...(this.values as unknown as FertilizerEnrichmentJobRow),
          updated_at: FIXED_NOW,
        }
        return { data: rows[index], error: null }
      }

      if (this.mode === 'delete') {
        const deleted = rows.filter((row) => matchesFilters(row, this.eqFilters, this.lteFilters))
        const remaining = rows.filter((row) => !matchesFilters(row, this.eqFilters, this.lteFilters))
        rows.splice(0, rows.length, ...remaining)
        return { data: deleted.map((row) => ({ job_id: row.job_id })), error: null }
      }

      const matches = rows.filter((row) => matchesFilters(row, this.eqFilters, this.lteFilters))
      if (requireSingle && matches.length !== 1) {
        return { data: null, error: { message: 'Expected single row' } }
      }

      return { data: matches[0] ?? null, error: null }
    }
  }

  const client = {
    from(table: string) {
      return new FakeQueryBuilder(table)
    },
  } as unknown as SupabaseClient

  return { client, rows, queries }
}

describe('fertilizerEnrichmentJobRepositoryPersistentCore', () => {
  it('P-1: save persists sanitized row and returns rebuilt record', async () => {
    const { client, rows } = createFakeSupabaseClient()
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    const saved = await repository.save(buildRecord())
    const insertedRow = rows[0]

    expect(saved.job.accessContext).toEqual(SESSION_ACCESS)
    expect(saved.revision).toBe(1)
    expect(saved.job.expiresAt).toBe(TEST_EXPIRES_AT)
    expect(JSON.stringify(insertedRow?.job_json)).not.toContain('sessionId')
  })

  it('P-2: getByJobId returns null for foreign session access without leak', async () => {
    const record = buildRecord()
    const row = mapRecordToRow(record, deriveHash)
    const { client } = createFakeSupabaseClient([row])
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    const loaded = await repository.getByJobId('job-1', {
      kind: 'session',
      sessionId: 'session-2',
    })

    expect(loaded).toBeNull()
  })

  it('P-3: findByIdempotencyKey resolves existing row for same access context', async () => {
    const row = mapRecordToRow(buildRecord(), deriveHash)
    const { client } = createFakeSupabaseClient([row])
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    const loaded = await repository.findByIdempotencyKey('idem-1', SESSION_ACCESS)
    expect(loaded?.job.jobId).toBe('job-1')
  })

  it('SVC-1: save performs a single insert without follow-up idempotency lookup', async () => {
    const { client, queries } = createFakeSupabaseClient()
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    await repository.save(buildRecord())

    expect(queries.filter((query) => query.mode === 'insert')).toHaveLength(1)
    expect(queries.filter((query) => query.mode === 'select')).toHaveLength(0)
  })

  it('SVC-2: session idempotency unique conflict throws idempotency_conflict', async () => {
    const row = mapRecordToRow(buildRecord(), deriveHash)
    const { client, queries } = createFakeSupabaseClient([row])
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    await expect(
      repository.save({
        ...buildRecord(),
        job: {
          ...buildJob(),
          jobId: 'job-2',
        },
      }),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' })

    expect(queries.filter((query) => query.mode === 'select')).toHaveLength(0)
  })

  it('SVC-3: authenticated idempotency unique conflict throws idempotency_conflict', async () => {
    const authAccess: FertilizerEnrichmentAccessContext = {
      kind: 'authenticated_user',
      userId: '00000000-0000-4000-8000-000000000099',
    }
    const authRecord = {
      ...buildRecord(),
      job: {
        ...buildJob(),
        accessContext: authAccess,
        jobId: 'job-auth-1',
        idempotencyKey: 'idem-auth',
      },
    }
    const row = mapRecordToRow(authRecord, deriveHash)
    const { client } = createFakeSupabaseClient([row])
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    await expect(
      repository.save({
        ...authRecord,
        job: {
          ...authRecord.job,
          jobId: 'job-auth-2',
        },
      }),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' })
  })

  it('SVC-4: unrelated unique conflict maps to persistence_unavailable', async () => {
    const row = mapRecordToRow(buildRecord(), deriveHash)
    const { client } = createFakeSupabaseClient([row], {
      duplicateConstraint: 'fertilizer_enrichment_jobs_pkey',
    })
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    await expect(repository.save(buildRecord())).rejects.toMatchObject({
      code: 'persistence_unavailable',
    })
  })

  it('SVC-5: save errors do not leak database messages', async () => {
    const row = mapRecordToRow(buildRecord(), deriveHash)
    const { client } = createFakeSupabaseClient([row])
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    await expect(
      repository.save({
        ...buildRecord(),
        job: {
          ...buildJob(),
          jobId: 'job-2',
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof FertilizerEnrichmentJobRepositoryError)) {
        return false
      }

      return (
        error.code === 'idempotency_conflict' &&
        !error.message.includes('duplicate key') &&
        !error.message.includes('23505')
      )
    })
  })

  it('RT-6: save inserts the provided expiresAt unchanged', async () => {
    const { client, rows } = createFakeSupabaseClient()
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    await repository.save(buildRecord())

    expect(rows[0]?.expires_at).toBe(TEST_EXPIRES_AT)
  })

  it('P-5: update increments revision with optimistic lock', async () => {
    const row = mapRecordToRow(buildRecord(), deriveHash)
    const { client } = createFakeSupabaseClient([row])
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    const updated = await repository.update({
      ...buildRecord(1),
      job: {
        ...buildJob(),
        updatedAt: '2026-07-29T11:00:00.000Z',
        result: {
          ...resultBase(),
          status: 'cancelled',
          cancellation: {
            reason: 'user_cancelled',
            cancelledAt: '2026-07-29T11:00:00.000Z',
            cancelledBy: 'user',
          },
        },
      },
    })

    expect(updated.revision).toBe(2)
  })

  it('P-6: update throws revision_conflict when expected revision is stale', async () => {
    const row = mapRecordToRow(buildRecord(2), deriveHash)
    const { client } = createFakeSupabaseClient([row])
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    await expect(repository.update(buildRecord(1))).rejects.toMatchObject({
      code: 'revision_conflict',
    })
  })

  it('P-7: deleteExpired removes rows at or before cutoff', async () => {
    const expiredRow = mapRecordToRow(buildRecord(), deriveHash)
    expiredRow.expires_at = '2026-07-20T10:00:00.000Z'
    const activeRow = mapRecordToRow(
      {
        ...buildRecord(),
        job: { ...buildJob(), jobId: 'job-2', idempotencyKey: 'idem-2' },
      },
      deriveHash,
    )
    const { client, rows } = createFakeSupabaseClient([expiredRow, activeRow])
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    const removed = await repository.deleteExpired?.('2026-07-25T00:00:00.000Z')

    expect(removed).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.job_id).toBe('job-2')
  })

  it('P-8: authenticated save persists without sessionId when runtime accessContext carries null', async () => {
    const authAccess: FertilizerEnrichmentAccessContext = {
      kind: 'authenticated_user',
      userId: '00000000-0000-4000-8000-000000000099',
      sessionId: null,
    }
    const { client, rows } = createFakeSupabaseClient()
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    const saved = await repository.save({
      ...buildRecord(),
      job: {
        ...buildJob(authAccess),
        jobId: 'job-auth-save',
        idempotencyKey: 'idem-auth-save',
      },
    })

    expect(saved.job.accessContext).toEqual(authAccess)
    expect(JSON.stringify(rows[0]?.job_json)).not.toContain('sessionId')
    expect((rows[0]?.job_json as { accessContext?: Record<string, unknown> }).accessContext).toEqual({
      kind: 'authenticated_user',
      userId: authAccess.userId,
    })
  })

  it('P-9: update keeps sessionId out of job_json while restoring it in memory', async () => {
    const { client, rows } = createFakeSupabaseClient()
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })

    const saved = await repository.save(buildRecord())
    const updated = await repository.update({
      ...saved,
      job: {
        ...saved.job,
        updatedAt: '2026-07-29T11:00:00.000Z',
        result: {
          ...resultBase(),
          status: 'needs_input',
          recommendedNextAction: 'upload_product_document',
        },
      },
    })

    expect(updated.job.accessContext).toEqual(SESSION_ACCESS)
    expect(JSON.stringify(rows[0]?.job_json)).not.toContain('sessionId')
  })

  it('P-10: service start and idempotent retry never persist sessionId in job_json', async () => {
    const { client, rows } = createFakeSupabaseClient()
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })
    const service = createFertilizerEnrichmentServerService({
      repository,
      resolveOrchestrationDependencies: () => createTestOrchestrationDependencies([]),
      resolveExpiresAt: createTestResolveExpiresAt(TEST_EXPIRES_AT),
      now: () => FIXED_NOW,
      createJobId: () => 'job-svc-1',
      createOrchestrationRunId: () => 'orch-svc-1',
    })

    const started = await service.startFertilizerEnrichment(
      {
        idempotencyKey: 'idem-svc-1',
        accessContext: SESSION_ACCESS,
        input: buildInput(),
      },
      { sessionId: 'session-1', requestId: 'req-svc-1' },
    )

    expect(started.accessContext).toEqual(SESSION_ACCESS)
    expect(JSON.stringify(rows[0]?.job_json)).not.toContain('sessionId')

    const retried = await service.startFertilizerEnrichment(
      {
        idempotencyKey: 'idem-svc-1',
        accessContext: SESSION_ACCESS,
        input: buildInput(),
      },
      { sessionId: 'session-1', requestId: 'req-svc-2' },
    )

    expect(retried.jobId).toBe(started.jobId)
    expect(JSON.stringify(rows[0]?.job_json)).not.toContain('sessionId')
  })

  it('P-11: service status reload keeps runtime sessionId outside persisted snapshot', async () => {
    const { client } = createFakeSupabaseClient()
    const repository = createPersistentFertilizerEnrichmentJobRepository({
      supabase: client,
      deriveSessionAccessHash: deriveHash,
    })
    const service = createFertilizerEnrichmentServerService({
      repository,
      resolveOrchestrationDependencies: () => createTestOrchestrationDependencies([]),
      resolveExpiresAt: createTestResolveExpiresAt(TEST_EXPIRES_AT),
      now: () => FIXED_NOW,
      createJobId: () => 'job-svc-status',
      createOrchestrationRunId: () => 'orch-svc-status',
    })

    const started = await service.startFertilizerEnrichment(
      {
        idempotencyKey: 'idem-svc-status',
        accessContext: SESSION_ACCESS,
        input: buildInput(),
      },
      { sessionId: 'session-1', requestId: 'req-svc-status-start' },
    )

    const status = await service.getFertilizerEnrichmentStatus(
      { jobId: started.jobId, accessContext: SESSION_ACCESS },
      { sessionId: 'session-1', requestId: 'req-svc-status-get' },
    )

    expect(status.accessContext).toEqual(SESSION_ACCESS)
  })
})
