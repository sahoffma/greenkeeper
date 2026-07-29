import type {
  CancelFertilizerEnrichmentRequest,
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
  type FertilizerEnrichmentJobRecord,
  type FertilizerEnrichmentJobRepository,
} from './fertilizerEnrichmentJobRepositoryCore'
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

  constructor(apiError: FertilizerEnrichmentApiError, httpStatus: number) {
    super(apiError.message)
    this.name = 'FertilizerEnrichmentServerApiError'
    this.apiError = apiError
    this.httpStatus = httpStatus
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
): FertilizerEnrichmentServerApiError {
  return new FertilizerEnrichmentServerApiError({ code, message }, httpStatus)
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

  return apiError(
    'internal_server_error',
    FERTILIZER_ENRICHMENT_SERVER_UNEXPECTED_FAILURE_MESSAGE,
    500,
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
          return toPublicJob(existing)
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

        const savedInitial = await dependencies.repository.save(initialRecord)

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

        const saved = await dependencies.repository.update(completedRecord)
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

        if (record.lastSourceProvisionIdempotencyKey === idempotencyKey) {
          return toPublicJob(record)
        }

        if (TERMINAL_ORCHESTRATION_STATUSES.has(record.job.result.status)) {
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

        if (record.job.result.status !== 'needs_input') {
          throw apiError(
            'orchestration_not_cancellable',
            'Additional sources are only supported while enrichment needs input.',
            409,
          )
        }

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

        const saved = await dependencies.repository.update(updatedRecord)
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

        const saved = await dependencies.repository.update(updatedRecord)
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
