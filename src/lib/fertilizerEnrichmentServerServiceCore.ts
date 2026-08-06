import type {
  CancelFertilizerEnrichmentRequest,
  FertilizerCaptureRecognitionPackagingBasis,
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentApiError,
  FertilizerEnrichmentJob,
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentOrchestrationResult,
  FertilizerEnrichmentOrchestrationResultBase,
  FertilizerEnrichmentOrchestrationStatus,
  FertilizerEnrichmentSourceHint,
  FertilizerUserProvidedSourceKind,
  FertilizerUserProvidedSourceRef,
  GetFertilizerEnrichmentStatusRequest,
  ProvideFertilizerAdditionalSourceRequest,
  StartFertilizerEnrichmentRequest,
} from '../types/fertilizerEnrichmentOrchestration'
import {
  assertPublicFertilizerEnrichmentJobShape,
  FertilizerEnrichmentJobRepositoryError,
  type FertilizerEnrichmentJobRecord,
  type FertilizerEnrichmentJobRepository,
} from './fertilizerEnrichmentJobRepositoryCore'
import {
  assertFertilizerEnrichmentJobNotExpired,
  FertilizerEnrichmentJobExpiryError,
} from './fertilizerEnrichmentJobExpiryCore'
import { assertCompatibleFertilizerEnrichmentStart } from './fertilizerEnrichmentStartCompatibilityCore'
import {
  FertilizerEnrichmentOrchestrationContractError,
  orchestrateFertilizerEnrichment,
  type FertilizerSourceAdapter,
  type OrchestrateFertilizerEnrichmentDependencies,
} from './fertilizerEnrichmentOrchestrationCore'

export interface FertilizerEnrichmentServerRequestContext {
  userId?: string | null
  sessionId?: string | null
  correlationId?: string | null
  requestId: string
}

export class FertilizerEnrichmentServerApiError extends Error {
  readonly apiError: FertilizerEnrichmentApiError

  readonly httpStatus: number

  readonly cause?: unknown

  constructor(
    apiError: FertilizerEnrichmentApiError,
    httpStatus: number,
    options?: { cause?: unknown },
  ) {
    super(apiError.message)
    this.name = 'FertilizerEnrichmentServerApiError'
    this.apiError = apiError
    this.httpStatus = httpStatus
    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

export interface FertilizerEnrichmentServerServiceDependencies {
  repository: FertilizerEnrichmentJobRepository
  resolveOrchestrationDependencies: () => OrchestrateFertilizerEnrichmentDependencies
  resolveExpiresAt: (job: FertilizerEnrichmentJob, now: string) => string
  now?: () => string
  createJobId?: () => string
  createOrchestrationRunId?: () => string
  createNormalizationRunId?: () => string
}

const TERMINAL_ORCHESTRATION_STATUSES = new Set<FertilizerEnrichmentOrchestrationStatus>([
  'intake_ready',
  'failed',
  'cancelled',
  'timed_out',
])

const SUPPORTED_ADDITIONAL_SOURCE_KINDS = new Set<FertilizerUserProvidedSourceKind>([
  'product_document',
  'other_user_source',
  'packaging_back_photo',
  'additional_packaging_photo',
])

const USER_DOCUMENT_SOURCE_KINDS = new Set<FertilizerUserProvidedSourceKind>([
  'product_document',
  'other_user_source',
])

const PACKAGING_SOURCE_KINDS = new Set<FertilizerUserProvidedSourceKind>([
  'packaging_back_photo',
  'additional_packaging_photo',
])

export const FERTILIZER_ENRICHMENT_SERVER_UNEXPECTED_FAILURE_MESSAGE =
  'Fertilizer enrichment server request failed unexpectedly.'

function defaultNow(): string {
  return new Date().toISOString()
}

function apiError(
  code: FertilizerEnrichmentApiError['code'],
  message: string,
  httpStatus: number,
  cause?: unknown,
): FertilizerEnrichmentServerApiError {
  return new FertilizerEnrichmentServerApiError({ code, message }, httpStatus, { cause })
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

function validateAccessContext(value: unknown): FertilizerEnrichmentAccessContext {
  if (!value || typeof value !== 'object') {
    throw apiError('invalid_request', 'accessContext is required.', 400)
  }

  const record = value as Record<string, unknown>
  const kind = record.kind

  if (kind === 'authenticated_user') {
    return {
      kind: 'authenticated_user',
      userId: assertNonEmptyString(record.userId, 'accessContext.userId'),
      sessionId:
        typeof record.sessionId === 'string' && record.sessionId.trim()
          ? record.sessionId.trim()
          : null,
    }
  }

  if (kind === 'session') {
    return {
      kind: 'session',
      sessionId: assertNonEmptyString(record.sessionId, 'accessContext.sessionId'),
    }
  }

  throw apiError('invalid_request', 'accessContext.kind is invalid.', 400)
}

export function validateRequestAccessContextAgainstServerContext(
  accessContext: FertilizerEnrichmentAccessContext,
  requestContext: FertilizerEnrichmentServerRequestContext,
): void {
  if (accessContext.kind === 'authenticated_user') {
    const userId = requestContext.userId?.trim()
    if (!userId || userId !== accessContext.userId) {
      throw apiError('unauthorized', 'Access to this enrichment job is not authorized.', 403)
    }
    return
  }

  const sessionId = requestContext.sessionId?.trim()
  if (!sessionId || sessionId !== accessContext.sessionId) {
    throw apiError('unauthorized', 'Access to this enrichment job is not authorized.', 403)
  }
}

function validateCaptureRecognitionPackagingBasis(
  value: unknown,
): FertilizerCaptureRecognitionPackagingBasis | undefined {
  if (value == null) {
    return undefined
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw apiError('invalid_request', 'captureRecognitionPackagingBasis must be an object.', 400)
  }

  const record = value as Record<string, unknown>
  const sourceId = assertNonEmptyString(
    record.sourceId,
    'captureRecognitionPackagingBasis.sourceId',
    512,
  )
  const productForm = record.productForm
  if (
    productForm != null &&
    productForm !== 'granular' &&
    productForm !== 'liquid' &&
    productForm !== 'unknown'
  ) {
    throw apiError('invalid_request', 'captureRecognitionPackagingBasis.productForm is invalid.', 400)
  }

  let npk: FertilizerCaptureRecognitionPackagingBasis['npk'] = null
  if (record.npk != null) {
    if (!record.npk || typeof record.npk !== 'object' || Array.isArray(record.npk)) {
      throw apiError('invalid_request', 'captureRecognitionPackagingBasis.npk must be an object.', 400)
    }

    const npkRecord = record.npk as Record<string, unknown>
    if (
      typeof npkRecord.nitrogen !== 'number' ||
      typeof npkRecord.phosphate !== 'number' ||
      typeof npkRecord.potash !== 'number'
    ) {
      throw apiError('invalid_request', 'captureRecognitionPackagingBasis.npk values are invalid.', 400)
    }

    npk = {
      nitrogen: npkRecord.nitrogen,
      phosphate: npkRecord.phosphate,
      potash: npkRecord.potash,
    }
  }

  return {
    sourceId,
    manufacturer: typeof record.manufacturer === 'string' ? record.manufacturer : null,
    officialName: typeof record.officialName === 'string' ? record.officialName : null,
    productLine: typeof record.productLine === 'string' ? record.productLine : null,
    variant: typeof record.variant === 'string' ? record.variant : null,
    productForm:
      productForm === 'granular' || productForm === 'liquid'
        ? productForm
        : null,
    npk,
    packageSizeValue: typeof record.packageSizeValue === 'number' ? record.packageSizeValue : null,
    packageSizeUnit: typeof record.packageSizeUnit === 'string' ? record.packageSizeUnit : null,
    recognitionFormLabel:
      typeof record.recognitionFormLabel === 'string' ? record.recognitionFormLabel : null,
    recognitionDescriptorLabel:
      typeof record.recognitionDescriptorLabel === 'string'
        ? record.recognitionDescriptorLabel
        : null,
  }
}

function validateCaptureDraftPackageDiagnostics(
  value: unknown,
): import('../types/fertilizerEnrichmentOrchestration').CaptureDraftPackageDiagnostics | undefined {
  if (value == null) {
    return undefined
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  const source = record.preparedDraftPackageSizeSource
  const unitCategory = record.selectedPackageUnitCategory

  return {
    selectedPackageQuantityPresent: record.selectedPackageQuantityPresent === true,
    selectedPackageUnitPresent: record.selectedPackageUnitPresent === true,
    selectedPackageUnitCategory:
      unitCategory === 'mass' || unitCategory === 'volume' || unitCategory === 'unknown'
        ? unitCategory
        : 'missing',
    recognitionResultPackageSizePresent: record.recognitionResultPackageSizePresent === true,
    recognitionCandidatePresent: record.recognitionCandidatePresent === true,
    recognitionCandidatePackageSizePresent: record.recognitionCandidatePackageSizePresent === true,
    recognitionSnapshotPresent: record.recognitionSnapshotPresent === true,
    recognitionSnapshotPackageSizePresent: record.recognitionSnapshotPackageSizePresent === true,
    preparedDraftPackageSizePresent: record.preparedDraftPackageSizePresent === true,
    preparedDraftPackageSizeSource:
      source === 'recognition_result' ||
      source === 'recognition_candidate' ||
      source === 'recognition_snapshot' ||
      source === 'recognition_raw_value' ||
      source === 'selected_package_fields' ||
      source === 'none'
        ? source
        : 'none',
    clientRecognitionPackageSizePresent: record.clientRecognitionPackageSizePresent === true,
    acceptInputPackageSizePresent: record.acceptInputPackageSizePresent === true,
    acceptOutputSelectedPackagePresent: record.acceptOutputSelectedPackagePresent === true,
    acceptOutputRecognitionPackageSizePresent:
      record.acceptOutputRecognitionPackageSizePresent === true,
  }
}

function validateOrchestrationInput(value: unknown): FertilizerEnrichmentOrchestrationInput {
  if (!value || typeof value !== 'object') {
    throw apiError('invalid_request', 'input is required.', 400)
  }

  const record = value as Record<string, unknown>
  const objectCategory = record.objectCategory
  const identity = record.identity

  if (objectCategory !== 'fertilizer') {
    throw apiError(
      'unsupported_object_category',
      'Only fertilizer enrichment is supported in this phase.',
      422,
    )
  }

  if (!identity || typeof identity !== 'object') {
    throw apiError('invalid_request', 'input.identity is required.', 400)
  }

  const identityRecord = identity as Record<string, unknown>
  const identityFingerprint = assertNonEmptyString(
    identityRecord.identityFingerprint,
    'input.identity.identityFingerprint',
    512,
  )

  return {
    objectCategory: 'fertilizer',
    identity: {
      manufacturer:
        typeof identityRecord.manufacturer === 'string' ? identityRecord.manufacturer : null,
      officialName:
        typeof identityRecord.officialName === 'string' ? identityRecord.officialName : null,
      productLine:
        typeof identityRecord.productLine === 'string' ? identityRecord.productLine : null,
      variant: typeof identityRecord.variant === 'string' ? identityRecord.variant : null,
      identityFingerprint,
      identityConfidence:
        typeof identityRecord.identityConfidence === 'number'
          ? identityRecord.identityConfidence
          : 0,
      hasIdentityAmbiguity: identityRecord.hasIdentityAmbiguity === true,
    },
    references:
      record.references && typeof record.references === 'object'
        ? (record.references as FertilizerEnrichmentOrchestrationInput['references'])
        : undefined,
    userProvidedSources: Array.isArray(record.userProvidedSources)
      ? record.userProvidedSources.map((entry) => validateUserProvidedSource(entry))
      : undefined,
    allowedInputChannels: Array.isArray(record.allowedInputChannels)
      ? (record.allowedInputChannels as FertilizerEnrichmentOrchestrationInput['allowedInputChannels'])
      : ['capture_flow'],
    sourceHints: Array.isArray(record.sourceHints)
      ? record.sourceHints.map((entry) => validateSourceHint(entry))
      : undefined,
    captureInlineSourceTexts:
      record.captureInlineSourceTexts &&
      typeof record.captureInlineSourceTexts === 'object' &&
      !Array.isArray(record.captureInlineSourceTexts)
        ? Object.fromEntries(
            Object.entries(record.captureInlineSourceTexts as Record<string, unknown>)
              .map(([key, value]) =>
                typeof value === 'string' && value.trim().length > 0
                  ? ([key.trim(), value] as const)
                  : null,
              )
              .filter((entry): entry is readonly [string, string] => entry != null),
          )
        : undefined,
    captureRecognitionPackagingBasis: validateCaptureRecognitionPackagingBasis(
      record.captureRecognitionPackagingBasis,
    ),
    captureEnrichmentInputBuilderPath:
      record.captureEnrichmentInputBuilderPath === 'canonical_capture' ||
      record.captureEnrichmentInputBuilderPath === 'legacy_capture' ||
      record.captureEnrichmentInputBuilderPath === 'unknown'
        ? record.captureEnrichmentInputBuilderPath
        : undefined,
    captureDraftPackageDiagnostics: validateCaptureDraftPackageDiagnostics(
      record.captureDraftPackageDiagnostics,
    ),
    priorOrchestrationRunId:
      typeof record.priorOrchestrationRunId === 'string' ? record.priorOrchestrationRunId : null,
    idempotencyKey: typeof record.idempotencyKey === 'string' ? record.idempotencyKey : null,
    orchestrationRunId:
      typeof record.orchestrationRunId === 'string' ? record.orchestrationRunId : null,
  }
}

function validateUserProvidedSource(value: unknown): FertilizerUserProvidedSourceRef {
  if (!value || typeof value !== 'object') {
    throw apiError('invalid_request', 'userProvidedSources entries must be objects.', 400)
  }

  const record = value as Record<string, unknown>
  const kind = record.kind
  if (typeof kind !== 'string' || !SUPPORTED_ADDITIONAL_SOURCE_KINDS.has(kind as FertilizerUserProvidedSourceKind)) {
    throw apiError('invalid_request', 'userProvidedSources.kind is not supported.', 400)
  }

  return {
    kind: kind as FertilizerUserProvidedSourceRef['kind'],
    referenceId: assertNonEmptyString(record.referenceId, 'userProvidedSources.referenceId', 512),
    label: typeof record.label === 'string' ? record.label : null,
    productVariantReference:
      typeof record.productVariantReference === 'string' ? record.productVariantReference : null,
  }
}

function validateSourceHint(value: unknown): FertilizerEnrichmentSourceHint {
  if (!value || typeof value !== 'object') {
    throw apiError('invalid_request', 'sourceHints entries must be objects.', 400)
  }

  const record = value as Record<string, unknown>
  return {
    sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : null,
    referenceId: typeof record.referenceId === 'string' ? record.referenceId : null,
    gtin: typeof record.gtin === 'string' ? record.gtin : null,
    catalogEntryId: typeof record.catalogEntryId === 'string' ? record.catalogEntryId : null,
    manufacturerCode: typeof record.manufacturerCode === 'string' ? record.manufacturerCode : null,
    hintType:
      record.hintType === 'recognition' ||
      record.hintType === 'user' ||
      record.hintType === 'catalog'
        ? record.hintType
        : null,
    adapterType:
      record.adapterType === 'user_document' || record.adapterType === 'packaging'
        ? record.adapterType
        : typeof record.adapterType === 'string'
          ? (record.adapterType as FertilizerEnrichmentSourceHint['adapterType'])
          : null,
  }
}

function mapUserSourceKindToAdapterType(
  kind: FertilizerUserProvidedSourceRef['kind'],
): 'user_document' | 'packaging' {
  if (USER_DOCUMENT_SOURCE_KINDS.has(kind)) {
    return 'user_document'
  }

  if (PACKAGING_SOURCE_KINDS.has(kind)) {
    return 'packaging'
  }

  throw apiError('invalid_request', 'additionalSources.kind is not supported.', 400)
}

function sourceFingerprint(source: FertilizerUserProvidedSourceRef): string {
  return `${mapUserSourceKindToAdapterType(source.kind)}:${source.referenceId.trim()}`
}

function sourceHintFingerprint(hint: FertilizerEnrichmentSourceHint): string | null {
  const adapterType = hint.adapterType
  const reference = hint.referenceId?.trim() ?? hint.sourceUrl?.trim()
  if (!adapterType || !reference) {
    return null
  }

  return `${adapterType}:${reference}`
}

function userSourceToHint(source: FertilizerUserProvidedSourceRef): FertilizerEnrichmentSourceHint {
  return {
    referenceId: source.referenceId,
    adapterType: mapUserSourceKindToAdapterType(source.kind),
    hintType: 'user',
  }
}

function mergeUniqueSources(
  existing: FertilizerUserProvidedSourceRef[],
  additions: FertilizerUserProvidedSourceRef[],
): { merged: FertilizerUserProvidedSourceRef[]; added: FertilizerUserProvidedSourceRef[] } {
  const seen = new Set(existing.map(sourceFingerprint))
  const merged = [...existing]
  const added: FertilizerUserProvidedSourceRef[] = []

  for (const source of additions) {
    const fingerprint = sourceFingerprint(source)
    if (seen.has(fingerprint)) {
      continue
    }

    seen.add(fingerprint)
    merged.push(source)
    added.push(source)
  }

  return { merged, added }
}

function mergeUniqueSourceHints(
  existing: FertilizerEnrichmentSourceHint[],
  additions: FertilizerEnrichmentSourceHint[],
): { merged: FertilizerEnrichmentSourceHint[]; added: FertilizerEnrichmentSourceHint[] } {
  const seen = new Set(
    existing.map(sourceHintFingerprint).filter((entry): entry is string => entry != null),
  )
  const merged = [...existing]
  const added: FertilizerEnrichmentSourceHint[] = []

  for (const hint of additions) {
    const fingerprint = sourceHintFingerprint(hint)
    if (!fingerprint || seen.has(fingerprint)) {
      continue
    }

    seen.add(fingerprint)
    merged.push(hint)
    added.push(hint)
  }

  return { merged, added }
}

function cloneJob(job: FertilizerEnrichmentJob): FertilizerEnrichmentJob {
  const snapshot = structuredClone(job)
  assertPublicFertilizerEnrichmentJobShape(snapshot)
  return snapshot
}

function applyExpiresAt(
  job: FertilizerEnrichmentJob,
  resolveExpiresAt: (job: FertilizerEnrichmentJob, now: string) => string,
  timestamp: string,
): FertilizerEnrichmentJob {
  return {
    ...job,
    expiresAt: resolveExpiresAt(job, timestamp),
  }
}

function toPublicJob(record: FertilizerEnrichmentJobRecord): FertilizerEnrichmentJob {
  return cloneJob(record.job)
}

async function loadAuthorizedRecord(
  repository: FertilizerEnrichmentJobRepository,
  jobId: string,
  accessContext: FertilizerEnrichmentAccessContext,
): Promise<FertilizerEnrichmentJobRecord> {
  const normalizedJobId = assertNonEmptyString(jobId, 'jobId', 512)
  const record = await repository.getByJobId(normalizedJobId, accessContext)

  if (!record) {
    throw apiError('job_not_found', 'Enrichment job was not found.', 404)
  }

  return record
}

function createRecognizedPlaceholderResult(
  orchestrationRunId: string,
  startedAt: string,
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerEnrichmentOrchestrationResult {
  const base: FertilizerEnrichmentOrchestrationResultBase = {
    orchestrationRunId,
    startedAt,
    completedAt: null,
    attemptedAdapters: [],
    successfulAdapters: [],
    failedAdapters: [],
    timeoutState: {
      kind: 'none',
      startedAt,
      timedOut: false,
      timedOutAdapters: [],
      completedAdapters: [],
      cancelledAdapters: [],
    },
    technicalErrors: [],
  }

  return {
    ...base,
    status: 'recognized',
    identity: input.identity,
  }
}

function buildCancelledOrchestrationResult(
  previous: FertilizerEnrichmentOrchestrationResult,
  cancelledAt: string,
): FertilizerEnrichmentOrchestrationResult {
  const base: FertilizerEnrichmentOrchestrationResultBase = {
    orchestrationRunId: previous.orchestrationRunId,
    startedAt: previous.startedAt,
    completedAt: cancelledAt,
    attemptedAdapters: previous.attemptedAdapters,
    successfulAdapters: previous.successfulAdapters,
    failedAdapters: previous.failedAdapters,
    timeoutState: previous.timeoutState,
    retryState: previous.retryState ?? null,
    technicalErrors: previous.technicalErrors,
    rawDeclarationInput: previous.rawDeclarationInput ?? null,
    partialAdapterResults: previous.partialAdapterResults,
  }

  return {
    ...base,
    status: 'cancelled',
    cancellation: {
      reason: 'user_cancelled',
      cancelledAt,
      cancelledBy: 'user',
    },
  }
}

export function mapFertilizerEnrichmentRepositoryError(
  error: FertilizerEnrichmentJobRepositoryError,
): FertilizerEnrichmentServerApiError {
  switch (error.code) {
    case 'persistence_unavailable':
      return apiError(
        'temporarily_unavailable',
        'Fertilizer enrichment persistence is temporarily unavailable.',
        503,
        error,
      )
    case 'invalid_stored_record':
      return apiError(
        'internal_server_error',
        FERTILIZER_ENRICHMENT_SERVER_UNEXPECTED_FAILURE_MESSAGE,
        500,
        error,
      )
    case 'idempotency_conflict':
      return apiError(
        'idempotency_conflict',
        'Enrichment job idempotency conflict.',
        409,
        error,
      )
    case 'revision_conflict':
      return apiError(
        'revision_conflict',
        'Enrichment job was updated concurrently.',
        409,
        error,
      )
  }
}

function assertJobNotExpiredForOperation(job: FertilizerEnrichmentJob, timestamp: string): void {
  try {
    assertFertilizerEnrichmentJobNotExpired(job, timestamp)
  } catch (error) {
    if (error instanceof FertilizerEnrichmentJobExpiryError) {
      if (error.kind === 'expired') {
        throw apiError('job_expired', 'Enrichment job has expired.', 410)
      }

      throw apiError(
        'internal_server_error',
        FERTILIZER_ENRICHMENT_SERVER_UNEXPECTED_FAILURE_MESSAGE,
        500,
      )
    }

    throw error
  }
}

function resolveExistingIdempotentStart(
  record: FertilizerEnrichmentJobRecord,
  input: FertilizerEnrichmentOrchestrationInput,
  accessContext: FertilizerEnrichmentAccessContext,
  timestamp: string,
): FertilizerEnrichmentJob {
  try {
    assertCompatibleFertilizerEnrichmentStart(record, input, accessContext)
  } catch {
    throw apiError('idempotency_conflict', 'Enrichment job idempotency conflict.', 409)
  }

  assertJobNotExpiredForOperation(record.job, timestamp)
  return toPublicJob(record)
}

async function reloadAuthorizedRecordOrUnavailable(
  repository: FertilizerEnrichmentJobRepository,
  jobId: string,
  accessContext: FertilizerEnrichmentAccessContext,
): Promise<FertilizerEnrichmentJobRecord> {
  const record = await repository.getByJobId(jobId, accessContext)
  if (!record) {
    throw apiError(
      'temporarily_unavailable',
      'Fertilizer enrichment persistence is temporarily unavailable.',
      503,
    )
  }

  return record
}

function mapRepositoryError(error: unknown): FertilizerEnrichmentServerApiError {
  if (error instanceof FertilizerEnrichmentJobRepositoryError) {
    return mapFertilizerEnrichmentRepositoryError(error)
  }

  return mapUnexpectedError(error)
}

function rejectTerminalAdditionalSource(record: FertilizerEnrichmentJobRecord): void {
  if (record.job.result.status === 'intake_ready') {
    throw apiError(
      'orchestration_not_cancellable',
      'Additional sources cannot be provided after intake is ready.',
      409,
    )
  }

  if (
    record.job.result.status === 'failed' &&
    record.job.result.failureReason === 'domain_not_ready'
  ) {
    throw apiError(
      'orchestration_not_cancellable',
      'Additional sources cannot continue a domain-not-ready failure.',
      409,
    )
  }

  throw apiError(
    'orchestration_not_cancellable',
    'Additional sources cannot be provided for a terminal enrichment job.',
    409,
  )
}

function assertAdditionalSourceContinuable(record: FertilizerEnrichmentJobRecord): void {
  if (TERMINAL_ORCHESTRATION_STATUSES.has(record.job.result.status)) {
    rejectTerminalAdditionalSource(record)
  }

  if (record.job.result.status !== 'needs_input') {
    throw apiError(
      'orchestration_not_cancellable',
      'Additional sources are only supported while enrichment needs input.',
      409,
    )
  }
}

function additionalSourceAlreadyApplied(
  record: FertilizerEnrichmentJobRecord,
  idempotencyKey: string,
  additionalSources: FertilizerUserProvidedSourceRef[],
): boolean {
  if (record.lastSourceProvisionIdempotencyKey === idempotencyKey) {
    return true
  }

  const existingSources = record.orchestrationInput.userProvidedSources ?? []
  const { added } = mergeUniqueSources(existingSources, additionalSources)
  return added.length === 0
}

async function handleAdditionalSourceRevisionConflict(
  repository: FertilizerEnrichmentJobRepository,
  record: FertilizerEnrichmentJobRecord,
  accessContext: FertilizerEnrichmentAccessContext,
  idempotencyKey: string,
  additionalSources: FertilizerUserProvidedSourceRef[],
  timestamp: string,
): Promise<FertilizerEnrichmentJob> {
  const reloaded = await reloadAuthorizedRecordOrUnavailable(
    repository,
    record.job.jobId,
    accessContext,
  )
  assertJobNotExpiredForOperation(reloaded.job, timestamp)

  if (additionalSourceAlreadyApplied(reloaded, idempotencyKey, additionalSources)) {
    return toPublicJob(reloaded)
  }

  throw apiError('revision_conflict', 'Enrichment job was updated concurrently.', 409)
}

async function handleCancelRevisionConflict(
  repository: FertilizerEnrichmentJobRepository,
  record: FertilizerEnrichmentJobRecord,
  accessContext: FertilizerEnrichmentAccessContext,
  timestamp: string,
): Promise<FertilizerEnrichmentJob> {
  const reloaded = await reloadAuthorizedRecordOrUnavailable(
    repository,
    record.job.jobId,
    accessContext,
  )
  assertJobNotExpiredForOperation(reloaded.job, timestamp)

  if (reloaded.job.result.status === 'cancelled') {
    return toPublicJob(reloaded)
  }

  if (TERMINAL_ORCHESTRATION_STATUSES.has(reloaded.job.result.status)) {
    throw apiError(
      'orchestration_not_cancellable',
      'This enrichment job can no longer be cancelled.',
      409,
    )
  }

  throw apiError('revision_conflict', 'Enrichment job was updated concurrently.', 409)
}

async function handleStartUpdateRevisionConflict(
  repository: FertilizerEnrichmentJobRepository,
  jobId: string,
  accessContext: FertilizerEnrichmentAccessContext,
  input: FertilizerEnrichmentOrchestrationInput,
  timestamp: string,
): Promise<FertilizerEnrichmentJob> {
  const reloaded = await reloadAuthorizedRecordOrUnavailable(repository, jobId, accessContext)

  try {
    assertCompatibleFertilizerEnrichmentStart(reloaded, input, accessContext)
  } catch {
    throw apiError('revision_conflict', 'Enrichment job was updated concurrently.', 409)
  }

  assertJobNotExpiredForOperation(reloaded.job, timestamp)
  return toPublicJob(reloaded)
}

function mapUnexpectedError(error: unknown): FertilizerEnrichmentServerApiError {
  if (error instanceof FertilizerEnrichmentServerApiError) {
    return error
  }

  if (error instanceof FertilizerEnrichmentOrchestrationContractError) {
    return apiError(
      'unsupported_object_category',
      'Only fertilizer enrichment is supported in this phase.',
      422,
    )
  }

  if (error instanceof FertilizerEnrichmentJobRepositoryError) {
    return mapFertilizerEnrichmentRepositoryError(error)
  }

  return apiError(
    'internal_server_error',
    FERTILIZER_ENRICHMENT_SERVER_UNEXPECTED_FAILURE_MESSAGE,
    500,
    error instanceof Error ? error : undefined,
  )
}

async function runOrchestrationForJob(
  dependencies: FertilizerEnrichmentServerServiceDependencies,
  input: FertilizerEnrichmentOrchestrationInput,
  orchestrationRunId: string,
  now: string,
): Promise<FertilizerEnrichmentOrchestrationResult> {
  const orchestrationDependencies = dependencies.resolveOrchestrationDependencies()
  const normalizationRunId =
    dependencies.createNormalizationRunId?.() ?? `${orchestrationRunId}-norm`

  return orchestrateFertilizerEnrichment(input, orchestrationDependencies, {
    orchestrationRunId,
    normalizedAt: now,
    evaluatedAt: now,
    normalizationRunId,
    enrichmentRunId: orchestrationRunId,
  })
}

export function createFertilizerEnrichmentServerService(
  dependencies: FertilizerEnrichmentServerServiceDependencies,
) {
  const now = dependencies.now ?? defaultNow
  const createJobId = dependencies.createJobId ?? (() => `job-${now()}`)
  const createOrchestrationRunId =
    dependencies.createOrchestrationRunId ?? (() => `orch-${now()}`)

  return {
    async startFertilizerEnrichment(
      request: StartFertilizerEnrichmentRequest,
      requestContext: FertilizerEnrichmentServerRequestContext,
    ): Promise<FertilizerEnrichmentJob> {
      try {
        const idempotencyKey = assertNonEmptyString(request.idempotencyKey, 'idempotencyKey', 512)
        const accessContext = validateAccessContext(request.accessContext)
        validateRequestAccessContextAgainstServerContext(accessContext, requestContext)
        const input = validateOrchestrationInput(request.input)

        const existing = await dependencies.repository.findByIdempotencyKey(
          idempotencyKey,
          accessContext,
        )
        if (existing) {
          return resolveExistingIdempotentStart(existing, input, accessContext, now())
        }

        const timestamp = now()
        const jobId = createJobId()
        const orchestrationRunId = createOrchestrationRunId()

        const initialJob = applyExpiresAt(
          {
            jobId,
            orchestrationRunId,
            idempotencyKey,
            accessContext,
            objectCategory: input.objectCategory,
            identityFingerprint: assertNonEmptyString(
              input.identity.identityFingerprint,
              'input.identity.identityFingerprint',
              512,
            ),
            createdAt: timestamp,
            updatedAt: timestamp,
            result: createRecognizedPlaceholderResult(orchestrationRunId, timestamp, input),
          },
          dependencies.resolveExpiresAt,
          timestamp,
        )

        const initialRecord: FertilizerEnrichmentJobRecord = {
          job: initialJob,
          orchestrationInput: structuredClone(input),
          lastSourceProvisionIdempotencyKey: null,
          recordSchemaVersion: 1,
          revision: 1,
        }

        let savedInitial: FertilizerEnrichmentJobRecord
        try {
          savedInitial = await dependencies.repository.save(initialRecord)
        } catch (error) {
          if (
            error instanceof FertilizerEnrichmentJobRepositoryError &&
            error.code === 'idempotency_conflict'
          ) {
            const raced = await dependencies.repository.findByIdempotencyKey(
              idempotencyKey,
              accessContext,
            )
            if (!raced) {
              throw apiError('idempotency_conflict', 'Enrichment job idempotency conflict.', 409)
            }

            return resolveExistingIdempotentStart(raced, input, accessContext, timestamp)
          }

          throw mapRepositoryError(error)
        }

        const result = await runOrchestrationForJob(
          dependencies,
          input,
          orchestrationRunId,
          timestamp,
        )

        const completedRecord: FertilizerEnrichmentJobRecord = {
          ...savedInitial,
          job: applyExpiresAt(
            {
              ...initialJob,
              orchestrationRunId: result.orchestrationRunId,
              updatedAt: now(),
              result,
            },
            dependencies.resolveExpiresAt,
            now(),
          ),
          orchestrationInput: structuredClone(input),
        }

        let saved: FertilizerEnrichmentJobRecord
        try {
          saved = await dependencies.repository.update(completedRecord)
        } catch (error) {
          if (
            error instanceof FertilizerEnrichmentJobRepositoryError &&
            error.code === 'revision_conflict'
          ) {
            return handleStartUpdateRevisionConflict(
              dependencies.repository,
              jobId,
              accessContext,
              input,
              now(),
            )
          }

          throw mapRepositoryError(error)
        }

        return toPublicJob(saved)
      } catch (error) {
        throw mapUnexpectedError(error)
      }
    },

    async getFertilizerEnrichmentStatus(
      request: GetFertilizerEnrichmentStatusRequest,
      requestContext: FertilizerEnrichmentServerRequestContext,
    ): Promise<FertilizerEnrichmentJob> {
      try {
        const accessContext = validateAccessContext(request.accessContext)
        validateRequestAccessContextAgainstServerContext(accessContext, requestContext)
        const record = await loadAuthorizedRecord(
          dependencies.repository,
          request.jobId,
          accessContext,
        )
        assertJobNotExpiredForOperation(record.job, now())
        return toPublicJob(record)
      } catch (error) {
        throw mapUnexpectedError(error)
      }
    },

    async provideAdditionalFertilizerEnrichmentSource(
      request: ProvideFertilizerAdditionalSourceRequest,
      requestContext: FertilizerEnrichmentServerRequestContext,
    ): Promise<FertilizerEnrichmentJob> {
      try {
        const idempotencyKey = assertNonEmptyString(request.idempotencyKey, 'idempotencyKey', 512)
        const accessContext = validateAccessContext(request.accessContext)
        validateRequestAccessContextAgainstServerContext(accessContext, requestContext)

        if (!Array.isArray(request.additionalSources) || request.additionalSources.length === 0) {
          throw apiError('invalid_request', 'additionalSources must contain at least one source.', 400)
        }

        const additionalSources = request.additionalSources.map((entry) =>
          validateUserProvidedSource(entry),
        )

        const record = await loadAuthorizedRecord(
          dependencies.repository,
          request.jobId,
          accessContext,
        )
        assertJobNotExpiredForOperation(record.job, now())

        if (record.lastSourceProvisionIdempotencyKey === idempotencyKey) {
          return toPublicJob(record)
        }

        assertAdditionalSourceContinuable(record)

        const baseInput = record.orchestrationInput
        if (!baseInput.identity) {
          throw apiError('invalid_request', 'Job is missing identity context for continuation.', 400)
        }

        const existingSources = baseInput.userProvidedSources ?? []
        const existingHints = baseInput.sourceHints ?? []
        const { merged: mergedSources, added: addedSources } = mergeUniqueSources(
          existingSources,
          additionalSources,
        )
        const sourceHints = additionalSources.map(userSourceToHint)
        const { merged: mergedHints } = mergeUniqueSourceHints(
          existingHints,
          sourceHints,
        )

        if (addedSources.length === 0) {
          return toPublicJob(record)
        }

        const timestamp = now()
        const orchestrationRunId = createOrchestrationRunId()
        const continuedInput: FertilizerEnrichmentOrchestrationInput = {
          ...structuredClone(baseInput),
          identity: structuredClone(baseInput.identity),
          userProvidedSources: mergedSources,
          sourceHints: mergedHints,
          priorOrchestrationRunId: record.job.orchestrationRunId,
          orchestrationRunId,
          allowedInputChannels: baseInput.allowedInputChannels ?? ['capture_flow', 'additional_source'],
        }

        const result = await runOrchestrationForJob(
          dependencies,
          continuedInput,
          orchestrationRunId,
          timestamp,
        )

        const updatedRecord: FertilizerEnrichmentJobRecord = {
          ...record,
          orchestrationInput: continuedInput,
          lastSourceProvisionIdempotencyKey: idempotencyKey,
          job: applyExpiresAt(
            {
              ...record.job,
              orchestrationRunId: result.orchestrationRunId,
              updatedAt: timestamp,
              result,
            },
            dependencies.resolveExpiresAt,
            timestamp,
          ),
        }

        let saved: FertilizerEnrichmentJobRecord
        try {
          saved = await dependencies.repository.update(updatedRecord)
        } catch (error) {
          if (
            error instanceof FertilizerEnrichmentJobRepositoryError &&
            error.code === 'revision_conflict'
          ) {
            return handleAdditionalSourceRevisionConflict(
              dependencies.repository,
              record,
              accessContext,
              idempotencyKey,
              additionalSources,
              timestamp,
            )
          }

          throw mapRepositoryError(error)
        }

        return toPublicJob(saved)
      } catch (error) {
        throw mapUnexpectedError(error)
      }
    },

    async cancelFertilizerEnrichment(
      request: CancelFertilizerEnrichmentRequest,
      requestContext: FertilizerEnrichmentServerRequestContext,
    ): Promise<FertilizerEnrichmentJob> {
      try {
        const accessContext = validateAccessContext(request.accessContext)
        validateRequestAccessContextAgainstServerContext(accessContext, requestContext)
        const record = await loadAuthorizedRecord(
          dependencies.repository,
          request.jobId,
          accessContext,
        )
        assertJobNotExpiredForOperation(record.job, now())

        if (record.job.result.status === 'cancelled') {
          return toPublicJob(record)
        }

        if (TERMINAL_ORCHESTRATION_STATUSES.has(record.job.result.status)) {
          throw apiError(
            'orchestration_not_cancellable',
            'This enrichment job can no longer be cancelled.',
            409,
          )
        }

        const timestamp = now()
        const updatedRecord: FertilizerEnrichmentJobRecord = {
          ...record,
          job: applyExpiresAt(
            {
              ...record.job,
              updatedAt: timestamp,
              result: buildCancelledOrchestrationResult(record.job.result, timestamp),
            },
            dependencies.resolveExpiresAt,
            timestamp,
          ),
        }

        let saved: FertilizerEnrichmentJobRecord
        try {
          saved = await dependencies.repository.update(updatedRecord)
        } catch (error) {
          if (
            error instanceof FertilizerEnrichmentJobRepositoryError &&
            error.code === 'revision_conflict'
          ) {
            return handleCancelRevisionConflict(
              dependencies.repository,
              record,
              accessContext,
              timestamp,
            )
          }

          throw mapRepositoryError(error)
        }

        return toPublicJob(saved)
      } catch (error) {
        throw mapUnexpectedError(error)
      }
    },
  }
}

export type FertilizerEnrichmentServerService = ReturnType<
  typeof createFertilizerEnrichmentServerService
>

export function createTestResolveExpiresAt(expiresAt: string) {
  return (_job: FertilizerEnrichmentJob, _now: string) => expiresAt
}

export function createTestOrchestrationDependencies(
  adapters: FertilizerSourceAdapter[],
  overrides: Partial<OrchestrateFertilizerEnrichmentDependencies> = {},
): OrchestrateFertilizerEnrichmentDependencies {
  return {
    adapters,
    assessFastPath: () => ({
      decision: 'ineligible',
      profilePresent: false,
      identityMatch: false,
      variantMatch: false,
      enrichmentVersionCompatible: false,
      normalizationVersionCompatible: false,
      readinessVersionCompatible: false,
      matrixComplete: false,
      provenanceComplete: false,
      hasBlockingConflicts: false,
      staleness: 'unknown',
    }),
    ...overrides,
  }
}

/** Test-only export for orchestration input validation parity with handleStart. */
export function validateFertilizerEnrichmentOrchestrationInputForTests(
  value: unknown,
): FertilizerEnrichmentOrchestrationInput {
  return validateOrchestrationInput(value)
}
