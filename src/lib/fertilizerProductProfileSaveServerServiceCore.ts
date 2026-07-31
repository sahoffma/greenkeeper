import type {
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentIntakeReadyResult,
} from '../types/fertilizerEnrichmentOrchestration'
import type {
  FertilizerProductProfileSaveApiError,
  SaveFertilizerProductProfileRequest,
  SaveFertilizerProductProfileResponse,
} from '../types/fertilizerProductProfileSave'
import {
  assertFertilizerEnrichmentJobNotExpired,
  FertilizerEnrichmentJobExpiryError,
} from './fertilizerEnrichmentJobExpiryCore'
import {
  FertilizerEnrichmentJobRepositoryError,
  type FertilizerEnrichmentJobRecord,
  type FertilizerEnrichmentJobRepository,
} from './fertilizerEnrichmentJobRepositoryCore'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import {
  FertilizerProductProfileRepositoryError,
  type FertilizerProductProfileRepository,
} from './fertilizerProductProfileRepositoryCore'
import {
  FertilizerProductProfileSaveError,
  saveConfirmedFertilizerProductProfile,
} from './fertilizerProductProfileSaveCore'

export class FertilizerProductProfileSaveServerApiError extends Error {
  readonly apiError: FertilizerProductProfileSaveApiError

  readonly httpStatus: number

  constructor(apiError: FertilizerProductProfileSaveApiError, httpStatus: number) {
    super(apiError.message)
    this.name = 'FertilizerProductProfileSaveServerApiError'
    this.apiError = apiError
    this.httpStatus = httpStatus
  }
}

export interface FertilizerProductProfileSaveServerServiceDependencies {
  enrichmentJobRepository: FertilizerEnrichmentJobRepository
  productProfileRepository: FertilizerProductProfileRepository
  deriveSessionAccessHash: DeriveSessionAccessHash
  now?: () => string
}

export const FERTILIZER_PRODUCT_PROFILE_SAVE_UNEXPECTED_FAILURE_MESSAGE =
  'Fertilizer product profile save request failed unexpectedly.'

const FORBIDDEN_CLIENT_SAVE_BODY_FIELDS = [
  'accessContext',
  'userId',
  'sessionId',
  'sessionAccessHash',
  'session_access_hash',
  'ownerId',
  'profileId',
  'compositionFingerprint',
  'compositionFingerprintVersion',
  'fingerprintVersion',
  'nutrientMatrix',
  'pipelineResult',
  'provenance',
  'productFamilyKey',
  'expiresAt',
  'revision',
  'recordSchemaVersion',
  'orchestrationInput',
  'lastSourceProvisionIdempotencyKey',
] as const

function defaultNow(): string {
  return new Date().toISOString()
}

function apiError(
  code: FertilizerProductProfileSaveApiError['code'],
  message: string,
  httpStatus: number,
): FertilizerProductProfileSaveServerApiError {
  return new FertilizerProductProfileSaveServerApiError({ code, message }, httpStatus)
}

function assertNonEmptyString(value: unknown, fieldName: string, maxLength = 256): string {
  if (typeof value !== 'string') {
    throw apiError('invalid_request', `${fieldName} must be a string.`, 400)
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw apiError('invalid_request', `${fieldName} must not be empty.`, 400)
  }

  if (trimmed.length > maxLength) {
    throw apiError('invalid_request', `${fieldName} exceeds the allowed length.`, 400)
  }

  return trimmed
}

export function assertNoClientProductProfileSaveFields(body: Record<string, unknown>): void {
  for (const field of FORBIDDEN_CLIENT_SAVE_BODY_FIELDS) {
    if (field in body) {
      throw apiError(
        'invalid_request',
        'Client-provided product profile save fields are not accepted.',
        400,
      )
    }
  }
}

export function validateSaveFertilizerProductProfileRequest(
  body: unknown,
): SaveFertilizerProductProfileRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw apiError('invalid_request', 'Request body must be a JSON object.', 400)
  }

  const record = body as Record<string, unknown>
  assertNoClientProductProfileSaveFields(record)

  const enrichmentJobId = assertNonEmptyString(record.enrichmentJobId, 'enrichmentJobId', 512)
  const idempotencyKey = assertNonEmptyString(record.idempotencyKey, 'idempotencyKey', 512)

  if (record.userConfirmed !== true) {
    throw apiError(
      'unconfirmed_save',
      'Product profile save requires explicit user confirmation.',
      422,
    )
  }

  return {
    enrichmentJobId,
    userConfirmed: true,
    idempotencyKey,
  }
}

async function loadAuthorizedEnrichmentRecord(
  repository: FertilizerEnrichmentJobRepository,
  jobId: string,
  accessContext: FertilizerEnrichmentAccessContext,
): Promise<FertilizerEnrichmentJobRecord> {
  const record = await repository.getByJobId(jobId, accessContext)

  if (!record) {
    throw apiError('job_not_found', 'Enrichment job was not found.', 404)
  }

  return record
}

function assertJobNotExpiredForSave(job: FertilizerEnrichmentJobRecord['job'], timestamp: string): void {
  try {
    assertFertilizerEnrichmentJobNotExpired(job, timestamp)
  } catch (error) {
    if (error instanceof FertilizerEnrichmentJobExpiryError) {
      if (error.kind === 'expired') {
        throw apiError('job_expired', 'Enrichment job has expired.', 410)
      }

      throw apiError(
        'internal_server_error',
        FERTILIZER_PRODUCT_PROFILE_SAVE_UNEXPECTED_FAILURE_MESSAGE,
        500,
      )
    }

    throw error
  }
}

function assertIntakeReadyResult(
  record: FertilizerEnrichmentJobRecord,
): FertilizerEnrichmentIntakeReadyResult {
  const result = record.job.result

  if (result.status !== 'intake_ready') {
    throw apiError(
      'not_save_ready',
      'Product profile save requires an intake-ready enrichment job.',
      422,
    )
  }

  if (!result.pipelineResult) {
    throw apiError(
      'not_save_ready',
      'Product profile save requires an intake-ready enrichment job.',
      422,
    )
  }

  return result
}

export function mapFertilizerProductProfileSaveCoreError(
  error: FertilizerProductProfileSaveError,
): FertilizerProductProfileSaveServerApiError {
  switch (error.code) {
    case 'unconfirmed_save':
      return apiError('unconfirmed_save', error.message, 422)
    case 'not_save_ready':
      return apiError('not_save_ready', error.message, 422)
    case 'unsupported_object_category':
      return apiError('unsupported_object_category', error.message, 422)
    case 'invalid_declaration':
      return apiError('invalid_declaration', error.message, 422)
    case 'incomplete_projection':
      return apiError('incomplete_projection', error.message, 422)
    case 'idempotency_conflict':
      return apiError('idempotency_conflict', error.message, 409)
    case 'persistence_unavailable':
      return apiError('persistence_unavailable', error.message, 503)
    case 'invalid_stored_record':
    case 'unsupported_fingerprint_version':
      return apiError(
        'internal_server_error',
        FERTILIZER_PRODUCT_PROFILE_SAVE_UNEXPECTED_FAILURE_MESSAGE,
        500,
      )
  }
}

function mapEnrichmentRepositoryError(
  error: FertilizerEnrichmentJobRepositoryError,
): FertilizerProductProfileSaveServerApiError {
  switch (error.code) {
    case 'persistence_unavailable':
      return apiError('persistence_unavailable', 'Enrichment job persistence is temporarily unavailable.', 503)
    case 'invalid_stored_record':
      return apiError(
        'internal_server_error',
        FERTILIZER_PRODUCT_PROFILE_SAVE_UNEXPECTED_FAILURE_MESSAGE,
        500,
      )
    case 'idempotency_conflict':
    case 'revision_conflict':
      return apiError(
        'internal_server_error',
        FERTILIZER_PRODUCT_PROFILE_SAVE_UNEXPECTED_FAILURE_MESSAGE,
        500,
      )
  }
}

function mapProductProfileRepositoryError(
  error: FertilizerProductProfileRepositoryError,
): FertilizerProductProfileSaveServerApiError {
  switch (error.code) {
    case 'persistence_unavailable':
      return apiError('persistence_unavailable', 'Product profile persistence is temporarily unavailable.', 503)
    case 'version_unique_conflict':
      return apiError('idempotency_conflict', 'Product profile save idempotency conflict.', 409)
    case 'invalid_stored_record':
    case 'idempotency_conflict':
      return apiError(
        'internal_server_error',
        FERTILIZER_PRODUCT_PROFILE_SAVE_UNEXPECTED_FAILURE_MESSAGE,
        500,
      )
  }
}

export function mapFertilizerProductProfileSaveUnexpectedError(
  error: unknown,
): FertilizerProductProfileSaveServerApiError {
  if (error instanceof FertilizerProductProfileSaveServerApiError) {
    return error
  }

  if (error instanceof FertilizerProductProfileSaveError) {
    return mapFertilizerProductProfileSaveCoreError(error)
  }

  if (error instanceof FertilizerEnrichmentJobRepositoryError) {
    return mapEnrichmentRepositoryError(error)
  }

  if (error instanceof FertilizerProductProfileRepositoryError) {
    return mapProductProfileRepositoryError(error)
  }

  return apiError(
    'internal_server_error',
    FERTILIZER_PRODUCT_PROFILE_SAVE_UNEXPECTED_FAILURE_MESSAGE,
    500,
  )
}

export function createFertilizerProductProfileSaveServerService(
  dependencies: FertilizerProductProfileSaveServerServiceDependencies,
) {
  const now = dependencies.now ?? defaultNow

  return {
    async saveFertilizerProductProfile(
      request: SaveFertilizerProductProfileRequest,
      accessContext: FertilizerEnrichmentAccessContext,
    ): Promise<SaveFertilizerProductProfileResponse> {
      try {
        const timestamp = now()
        const record = await loadAuthorizedEnrichmentRecord(
          dependencies.enrichmentJobRepository,
          request.enrichmentJobId,
          accessContext,
        )

        assertJobNotExpiredForSave(record.job, timestamp)
        const intakeReadyResult = assertIntakeReadyResult(record)

        const saveResult = await saveConfirmedFertilizerProductProfile(
          {
            intakeReadyResult,
            accessContext,
            userConfirmed: request.userConfirmed,
            idempotencyKey: request.idempotencyKey,
            enrichmentJobId: record.job.jobId,
          },
          {
            repository: dependencies.productProfileRepository,
            deriveSessionAccessHash: dependencies.deriveSessionAccessHash,
            now,
          },
        )

        return {
          profile: saveResult.publicProfile,
          reusedExistingVersion: saveResult.reusedExistingVersion,
        }
      } catch (error) {
        throw mapFertilizerProductProfileSaveUnexpectedError(error)
      }
    },
  }
}

export type FertilizerProductProfileSaveServerService = ReturnType<
  typeof createFertilizerProductProfileSaveServerService
>
