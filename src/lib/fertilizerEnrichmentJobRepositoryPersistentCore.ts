import type { SupabaseClient } from '@supabase/supabase-js'
import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import {
  FERTILIZER_ENRICHMENT_JOB_ROW_SELECT,
  FERTILIZER_ENRICHMENT_JOBS_TABLE,
  mapRecordToRow,
  mapRowToRecord,
  type FertilizerEnrichmentJobRow,
  validateFertilizerEnrichmentJobRecord,
} from './fertilizerEnrichmentJobRepositoryMappingCore'
import {
  FertilizerEnrichmentJobRepositoryError,
  type FertilizerEnrichmentJobRecord,
  type FertilizerEnrichmentJobRepository,
} from './fertilizerEnrichmentJobRepositoryCore'

export interface PersistentFertilizerEnrichmentJobRepositoryDependencies {
  supabase: SupabaseClient
  deriveSessionAccessHash: DeriveSessionAccessHash
  validateRecord?: (record: FertilizerEnrichmentJobRecord) => void
}

const START_IDEMPOTENCY_UNIQUE_INDEXES = new Set([
  'fertilizer_enrichment_jobs_auth_idempotency_idx',
  'fertilizer_enrichment_jobs_session_idempotency_idx',
])

function mapPersistenceError(error: unknown): FertilizerEnrichmentJobRepositoryError {
  if (error instanceof FertilizerEnrichmentJobRepositoryError) {
    return error
  }

  return new FertilizerEnrichmentJobRepositoryError(
    'persistence_unavailable',
    'Fertilizer enrichment job persistence failed.',
    { cause: error instanceof Error || (error && typeof error === 'object') ? error : undefined },
  )
}

function mapInsertError(error: {
  code?: string | null
  message?: string | null
  details?: string | null
}): FertilizerEnrichmentJobRepositoryError {
  if (error.code === '23505') {
    const constraintHaystack = `${error.message ?? ''} ${error.details ?? ''}`
    const isStartIdempotencyConflict = [...START_IDEMPOTENCY_UNIQUE_INDEXES].some((indexName) =>
      constraintHaystack.includes(indexName),
    )

    if (isStartIdempotencyConflict) {
      return new FertilizerEnrichmentJobRepositoryError(
        'idempotency_conflict',
        'Enrichment job start idempotency conflict.',
        { cause: error },
      )
    }

    return new FertilizerEnrichmentJobRepositoryError(
      'persistence_unavailable',
      'Enrichment job persistence write failed.',
      { cause: error },
    )
  }

  return new FertilizerEnrichmentJobRepositoryError(
    'persistence_unavailable',
    'Enrichment job persistence write failed.',
    { cause: error },
  )
}

function applyAccessFilters<T extends { eq: (column: string, value: unknown) => T }>(
  query: T,
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): T {
  if (accessContext.kind === 'authenticated_user') {
    return query
      .eq('access_kind', 'authenticated_user')
      .eq('user_id', accessContext.userId)
  }

  return query
    .eq('access_kind', 'session')
    .eq('session_access_hash', deriveSessionAccessHash(accessContext.sessionId))
}

function rowToRecord(
  row: FertilizerEnrichmentJobRow,
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
  validateRecord: (record: FertilizerEnrichmentJobRecord) => void,
): FertilizerEnrichmentJobRecord {
  const record = mapRowToRecord(row, accessContext, deriveSessionAccessHash)
  validateRecord(record)
  return record
}

export function createPersistentFertilizerEnrichmentJobRepository(
  dependencies: PersistentFertilizerEnrichmentJobRepositoryDependencies,
): FertilizerEnrichmentJobRepository {
  const validateRecord = dependencies.validateRecord ?? validateFertilizerEnrichmentJobRecord
  const { supabase, deriveSessionAccessHash } = dependencies

  return {
    async getByJobId(jobId, accessContext) {
      try {
        const baseQuery = supabase
          .from(FERTILIZER_ENRICHMENT_JOBS_TABLE)
          .select(FERTILIZER_ENRICHMENT_JOB_ROW_SELECT)
          .eq('job_id', jobId)

        const { data, error } = await applyAccessFilters(
          baseQuery,
          accessContext,
          deriveSessionAccessHash,
        ).maybeSingle()

        if (error) {
          throw new FertilizerEnrichmentJobRepositoryError(
            'persistence_unavailable',
            'Failed to load enrichment job.',
            { cause: error },
          )
        }

        if (!data) {
          return null
        }

        return rowToRecord(
          data as FertilizerEnrichmentJobRow,
          accessContext,
          deriveSessionAccessHash,
          validateRecord,
        )
      } catch (error) {
        throw mapPersistenceError(error)
      }
    },

    async findByIdempotencyKey(idempotencyKey, accessContext) {
      try {
        const baseQuery = supabase
          .from(FERTILIZER_ENRICHMENT_JOBS_TABLE)
          .select(FERTILIZER_ENRICHMENT_JOB_ROW_SELECT)
          .eq('idempotency_key', idempotencyKey)

        const { data, error } = await applyAccessFilters(
          baseQuery,
          accessContext,
          deriveSessionAccessHash,
        ).maybeSingle()

        if (error) {
          throw new FertilizerEnrichmentJobRepositoryError(
            'persistence_unavailable',
            'Failed to find enrichment job by idempotency key.',
            { cause: error },
          )
        }

        if (!data) {
          return null
        }

        return rowToRecord(
          data as FertilizerEnrichmentJobRow,
          accessContext,
          deriveSessionAccessHash,
          validateRecord,
        )
      } catch (error) {
        throw mapPersistenceError(error)
      }
    },

    async save(record) {
      try {
        validateRecord(record)
        const row = mapRecordToRow(record, deriveSessionAccessHash)

        const { data, error } = await supabase
          .from(FERTILIZER_ENRICHMENT_JOBS_TABLE)
          .insert(row)
          .select(FERTILIZER_ENRICHMENT_JOB_ROW_SELECT)
          .single()

        if (error) {
          throw mapInsertError(error)
        }

        return rowToRecord(
          data as FertilizerEnrichmentJobRow,
          record.job.accessContext,
          deriveSessionAccessHash,
          validateRecord,
        )
      } catch (error) {
        throw mapPersistenceError(error)
      }
    },

    async update(record) {
      try {
        validateRecord(record)
        const row = mapRecordToRow(record, deriveSessionAccessHash)
        const expectedRevision = record.revision

        const { data, error } = await supabase
          .from(FERTILIZER_ENRICHMENT_JOBS_TABLE)
          .update({
            orchestration_run_id: row.orchestration_run_id,
            idempotency_key: row.idempotency_key,
            access_kind: row.access_kind,
            user_id: row.user_id,
            session_access_hash: row.session_access_hash,
            object_category: row.object_category,
            identity_fingerprint: row.identity_fingerprint,
            job_json: row.job_json,
            orchestration_input_json: row.orchestration_input_json,
            last_source_provision_idempotency_key: row.last_source_provision_idempotency_key,
            record_schema_version: row.record_schema_version,
            revision: expectedRevision + 1,
            updated_at: row.updated_at,
            expires_at: row.expires_at,
          })
          .eq('job_id', row.job_id)
          .eq('revision', expectedRevision)
          .select(FERTILIZER_ENRICHMENT_JOB_ROW_SELECT)
          .maybeSingle()

        if (error) {
          throw new FertilizerEnrichmentJobRepositoryError(
            'persistence_unavailable',
            'Failed to update enrichment job.',
            { cause: error },
          )
        }

        if (!data) {
          throw new FertilizerEnrichmentJobRepositoryError(
            'revision_conflict',
            `Job "${record.job.jobId}" revision conflict.`,
          )
        }

        return rowToRecord(
          data as FertilizerEnrichmentJobRow,
          record.job.accessContext,
          deriveSessionAccessHash,
          validateRecord,
        )
      } catch (error) {
        throw mapPersistenceError(error)
      }
    },

    async deleteExpired(nowIso) {
      try {
        const { data, error } = await supabase
          .from(FERTILIZER_ENRICHMENT_JOBS_TABLE)
          .delete()
          .lte('expires_at', nowIso)
          .select('job_id')

        if (error) {
          throw new FertilizerEnrichmentJobRepositoryError(
            'persistence_unavailable',
            'Failed to delete expired enrichment jobs.',
            { cause: error },
          )
        }

        return data?.length ?? 0
      } catch (error) {
        throw mapPersistenceError(error)
      }
    },
  }
}
