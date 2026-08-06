import type {
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentJob,
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentOrchestrationStatus,
  FertilizerEnrichmentSourceHint,
} from '../types/fertilizerEnrichmentOrchestration'
import { FERTILIZER_ENRICHMENT_ORCHESTRATION_STATUSES } from '../types/fertilizerEnrichmentOrchestration'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import { isValidSessionAccessHash } from './fertilizerSessionAccessHashValidationCore'
import type { FertilizerEnrichmentJobRecord } from './fertilizerEnrichmentJobRepositoryCore'
import { FertilizerEnrichmentJobRepositoryError } from './fertilizerEnrichmentJobRepositoryCore'

export const FERTILIZER_ENRICHMENT_JOB_RECORD_SCHEMA_VERSION = 1

export const FERTILIZER_ENRICHMENT_JOBS_TABLE = 'fertilizer_enrichment_jobs'

export const FERTILIZER_ENRICHMENT_JOB_ROW_SELECT =
  'job_id, orchestration_run_id, idempotency_key, access_kind, user_id, session_access_hash, object_category, identity_fingerprint, job_json, orchestration_input_json, last_source_provision_idempotency_key, record_schema_version, revision, created_at, updated_at, expires_at'

export interface FertilizerEnrichmentJobRow {
  job_id: string
  orchestration_run_id: string
  idempotency_key: string
  access_kind: 'authenticated_user' | 'session'
  user_id: string | null
  session_access_hash: string | null
  object_category: string
  identity_fingerprint: string
  job_json: unknown
  orchestration_input_json: unknown
  last_source_provision_idempotency_key: string | null
  record_schema_version: number
  revision: number
  created_at: string
  updated_at: string
  expires_at: string
}

const SENSITIVE_URL_QUERY_KEYS = new Set([
  'access_token',
  'auth',
  'authorization',
  'key',
  'secret',
  'signature',
  'token',
])

function cloneJson<T>(value: T): T {
  return structuredClone(value)
}

function assertObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      `${fieldName} must be a JSON object.`,
    )
  }

  return value as Record<string, unknown>
}

function sanitizeSourceHintUrl(sourceUrl: string | null | undefined): string | null {
  if (typeof sourceUrl !== 'string') {
    return null
  }

  const trimmed = sourceUrl.trim()
  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(trimmed)
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_URL_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key)
      }
    }

    return url.toString()
  } catch {
    return trimmed
  }
}

export type PersistedFertilizerEnrichmentAccessContext =
  | {
      kind: 'authenticated_user'
      userId: string
    }
  | {
      kind: 'session'
    }

export function sanitizeJobJsonAccessContextForPersistence(
  accessContext: FertilizerEnrichmentAccessContext,
): PersistedFertilizerEnrichmentAccessContext {
  if (accessContext.kind === 'session') {
    return { kind: 'session' }
  }

  return {
    kind: 'authenticated_user',
    userId: accessContext.userId,
  }
}

export function sanitizeJobForPersistence(
  job: FertilizerEnrichmentJob,
): Omit<FertilizerEnrichmentJob, 'accessContext'> & {
  accessContext: PersistedFertilizerEnrichmentAccessContext
} {
  const snapshot = cloneJson(job)
  const { accessContext, ...rest } = snapshot
  return {
    ...rest,
    accessContext: sanitizeJobJsonAccessContextForPersistence(accessContext),
  }
}

export function sanitizeOrchestrationInputForPersistence(
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerEnrichmentOrchestrationInput {
  const snapshot = cloneJson(input)

  if (snapshot.references) {
    const { sessionId: _sessionId, ...restReferences } = snapshot.references
    snapshot.references = Object.keys(restReferences).length > 0 ? restReferences : undefined
  }

  if (snapshot.sourceHints) {
    snapshot.sourceHints = snapshot.sourceHints.map((hint) => sanitizeSourceHintForPersistence(hint))
  }

  return snapshot
}

function sanitizeSourceHintForPersistence(
  hint: FertilizerEnrichmentSourceHint,
): FertilizerEnrichmentSourceHint {
  return {
    ...hint,
    sourceUrl: sanitizeSourceHintUrl(hint.sourceUrl),
  }
}

function resolveAccessKind(
  accessContext: FertilizerEnrichmentAccessContext,
): 'authenticated_user' | 'session' {
  return accessContext.kind
}

function resolveSessionAccessHash(
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): string | null {
  if (accessContext.kind !== 'session') {
    return null
  }

  return deriveSessionAccessHash(accessContext.sessionId)
}

function resolveUserId(accessContext: FertilizerEnrichmentAccessContext): string | null {
  return accessContext.kind === 'authenticated_user' ? accessContext.userId : null
}

export function resolveRecordExpiresAt(record: FertilizerEnrichmentJobRecord): string {
  const expiresAt = record.job.expiresAt
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'job.expiresAt is required.',
    )
  }

  const createdAtMs = Date.parse(record.job.createdAt)
  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(createdAtMs) || expiresAtMs <= createdAtMs) {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'job.expiresAt must be after createdAt.',
    )
  }

  return expiresAt
}

function assertPersistableJobSnapshot(record: FertilizerEnrichmentJobRecord): void {
  const sanitizedJob = sanitizeJobForPersistence(record.job)
  assertPersistedJobJsonHasNoSessionId(sanitizedJob as unknown as Record<string, unknown>)
  const sanitizedInput = sanitizeOrchestrationInputForPersistence(record.orchestrationInput)
  assertPersistedOrchestrationInputHasNoSessionId(sanitizedInput as unknown as Record<string, unknown>)
}

export function mapRecordToRow(
  record: FertilizerEnrichmentJobRecord,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): FertilizerEnrichmentJobRow {
  const expiresAt = resolveRecordExpiresAt(record)
  const accessContext = record.job.accessContext
  const accessKind = resolveAccessKind(accessContext)
  const sanitizedJob = sanitizeJobForPersistence(record.job)
  const sanitizedInput = sanitizeOrchestrationInputForPersistence(record.orchestrationInput)
  assertPersistedJobJsonHasNoSessionId(sanitizedJob as unknown as Record<string, unknown>)
  assertPersistedOrchestrationInputHasNoSessionId(sanitizedInput as unknown as Record<string, unknown>)

  return {
    job_id: record.job.jobId,
    orchestration_run_id: record.job.orchestrationRunId,
    idempotency_key: record.job.idempotencyKey,
    access_kind: accessKind,
    user_id: resolveUserId(accessContext),
    session_access_hash: resolveSessionAccessHash(accessContext, deriveSessionAccessHash),
    object_category: record.job.objectCategory,
    identity_fingerprint: record.job.identityFingerprint,
    job_json: sanitizedJob,
    orchestration_input_json: sanitizedInput,
    last_source_provision_idempotency_key: record.lastSourceProvisionIdempotencyKey ?? null,
    record_schema_version: record.recordSchemaVersion,
    revision: record.revision,
    created_at: record.job.createdAt,
    updated_at: record.job.updatedAt,
    expires_at: expiresAt,
  }
}

function parseOrchestrationStatus(value: unknown): FertilizerEnrichmentOrchestrationStatus {
  if (
    typeof value === 'string' &&
    FERTILIZER_ENRICHMENT_ORCHESTRATION_STATUSES.includes(value as FertilizerEnrichmentOrchestrationStatus)
  ) {
    return value as FertilizerEnrichmentOrchestrationStatus
  }

  throw new FertilizerEnrichmentJobRepositoryError(
    'invalid_stored_record',
    'Stored job_json.result.status is invalid.',
  )
}

function assertPersistedJobJsonHasNoSessionId(jobJson: Record<string, unknown>): void {
  const accessContext = jobJson.accessContext
  if (accessContext && typeof accessContext === 'object' && !Array.isArray(accessContext)) {
    if ('sessionId' in accessContext) {
      throw new FertilizerEnrichmentJobRepositoryError(
        'invalid_stored_record',
        'Persisted job_json must not contain sessionId.',
      )
    }
  }
}

function assertPersistedOrchestrationInputHasNoSessionId(input: Record<string, unknown>): void {
  const references = input.references
  if (references && typeof references === 'object' && !Array.isArray(references)) {
    if ('sessionId' in references) {
      throw new FertilizerEnrichmentJobRepositoryError(
        'invalid_stored_record',
        'Persisted orchestration_input_json must not contain references.sessionId.',
      )
    }
  }
}

function verifyRowMatchesRequestAccessContext(
  row: Pick<FertilizerEnrichmentJobRow, 'access_kind' | 'user_id' | 'session_access_hash'>,
  requestAccessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): void {
  if (row.access_kind === 'authenticated_user') {
    if (requestAccessContext.kind !== 'authenticated_user' || requestAccessContext.userId !== row.user_id) {
      throw new FertilizerEnrichmentJobRepositoryError(
        'invalid_stored_record',
        'Authenticated job row does not match request access context.',
      )
    }
    return
  }

  if (requestAccessContext.kind !== 'session') {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'Session job row does not match request access context.',
    )
  }

  const expectedHash = deriveSessionAccessHash(requestAccessContext.sessionId)
  if (expectedHash !== row.session_access_hash) {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'Session job row does not match request access context.',
    )
  }
}

function rebuildJobAccessContext(
  requestAccessContext: FertilizerEnrichmentAccessContext,
): FertilizerEnrichmentAccessContext {
  if (requestAccessContext.kind === 'authenticated_user') {
    return {
      kind: 'authenticated_user',
      userId: requestAccessContext.userId,
      sessionId: requestAccessContext.sessionId ?? null,
    }
  }

  return {
    kind: 'session',
    sessionId: requestAccessContext.sessionId,
  }
}

export function parseStoredJobJson(
  jobJson: unknown,
  requestAccessContext: FertilizerEnrichmentAccessContext,
  row: Pick<FertilizerEnrichmentJobRow, 'access_kind' | 'user_id' | 'session_access_hash'>,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): FertilizerEnrichmentJob {
  const object = assertObject(jobJson, 'job_json')
  assertPersistedJobJsonHasNoSessionId(object)

  const result = object.result
  const resultObject = assertObject(result, 'job_json.result')
  parseOrchestrationStatus(resultObject.status)

  verifyRowMatchesRequestAccessContext(row, requestAccessContext, deriveSessionAccessHash)

  return {
    ...(object as unknown as FertilizerEnrichmentJob),
    accessContext: rebuildJobAccessContext(requestAccessContext),
  }
}

export function parseStoredOrchestrationInput(inputJson: unknown): FertilizerEnrichmentOrchestrationInput {
  const object = assertObject(inputJson, 'orchestration_input_json')
  assertPersistedOrchestrationInputHasNoSessionId(object)

  if (object.objectCategory !== 'fertilizer') {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'Stored orchestration_input_json.objectCategory is invalid.',
    )
  }

  if (!object.identity || typeof object.identity !== 'object' || Array.isArray(object.identity)) {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'Stored orchestration_input_json.identity is invalid.',
    )
  }

  return object as unknown as FertilizerEnrichmentOrchestrationInput
}

export function mapRowToRecord(
  row: FertilizerEnrichmentJobRow,
  requestAccessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): FertilizerEnrichmentJobRecord {
  if (row.record_schema_version !== FERTILIZER_ENRICHMENT_JOB_RECORD_SCHEMA_VERSION) {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      `Unsupported record_schema_version "${row.record_schema_version}".`,
    )
  }

  if (row.object_category !== 'fertilizer') {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'Stored object_category is invalid.',
    )
  }

  if (row.access_kind === 'session') {
    if (!row.session_access_hash || !isValidSessionAccessHash(row.session_access_hash)) {
      throw new FertilizerEnrichmentJobRepositoryError(
        'invalid_stored_record',
        'Stored session_access_hash is invalid.',
      )
    }
  }

  const job = parseStoredJobJson(row.job_json, requestAccessContext, row, deriveSessionAccessHash)
  const orchestrationInput = parseStoredOrchestrationInput(row.orchestration_input_json)

  return {
    job: {
      ...job,
      jobId: row.job_id,
      orchestrationRunId: row.orchestration_run_id,
      idempotencyKey: row.idempotency_key,
      objectCategory: 'fertilizer',
      identityFingerprint: row.identity_fingerprint,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    },
    orchestrationInput,
    lastSourceProvisionIdempotencyKey: row.last_source_provision_idempotency_key,
    recordSchemaVersion: row.record_schema_version,
    revision: row.revision,
  }
}

export function validateFertilizerEnrichmentJobRecord(record: FertilizerEnrichmentJobRecord): void {
  if (record.recordSchemaVersion < 1) {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'recordSchemaVersion must be >= 1.',
    )
  }

  if (record.revision < 1) {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'revision must be >= 1.',
    )
  }

  if (record.job.objectCategory !== 'fertilizer') {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'job.objectCategory must be fertilizer.',
    )
  }

  parseOrchestrationStatus(record.job.result.status)

  resolveRecordExpiresAt(record)

  if (
    record.lastSourceProvisionIdempotencyKey != null &&
    record.lastSourceProvisionIdempotencyKey.trim() === ''
  ) {
    throw new FertilizerEnrichmentJobRepositoryError(
      'invalid_stored_record',
      'lastSourceProvisionIdempotencyKey must not be empty when set.',
    )
  }

  assertPersistableJobSnapshot(record)
}

export function persistedJobJsonHasNoRawSessionId(value: unknown): boolean {
  try {
    const object = assertObject(value, 'job_json')
    assertPersistedJobJsonHasNoSessionId(object)
    return true
  } catch {
    return false
  }
}

export function persistedOrchestrationInputHasNoRawSessionId(value: unknown): boolean {
  try {
    const object = assertObject(value, 'orchestration_input_json')
    assertPersistedOrchestrationInputHasNoSessionId(object)
    return true
  } catch {
    return false
  }
}
