import type { FertilizerDeclarationNormalizationResult } from './fertilizerDeclarationNormalization'
import type { RawFertilizerDeclarationInput } from './fertilizerDeclarationNormalization'
import type {
  FertilizerEnrichmentIdentity,
  FertilizerEnrichmentProductFormValue,
  FertilizerEnrichmentSourceCategory,
} from './fertilizerEnrichment'
import {
  FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
  type FertilizerDeclarationNormalizationSpecificationVersion,
} from './fertilizerDeclarationNormalization'
import { FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION } from './fertilizerEnrichment'
import {
  FERTILIZER_READINESS_SPECIFICATION_VERSION,
  type FertilizerMissingRequirementKey,
  type FertilizerNpkDeclarationBasis,
  type FertilizerNutrientMatrixKey,
  type FertilizerObjectCategory,
  type FertilizerProductProfileReadinessInput,
  type FertilizerReadinessResult,
  type FertilizerReadinessSpecificationVersion,
  type FertilizerSuggestedInputAction,
} from './fertilizerReadiness'

// ---------------------------------------------------------------------------
// Orchestration status
// ---------------------------------------------------------------------------

export const FERTILIZER_ENRICHMENT_ORCHESTRATION_STATUSES = [
  'recognized',
  'enriching',
  'needs_input',
  'intake_ready',
  'failed',
  'cancelled',
  'timed_out',
] as const

export type FertilizerEnrichmentOrchestrationStatus =
  (typeof FERTILIZER_ENRICHMENT_ORCHESTRATION_STATUSES)[number]

// ---------------------------------------------------------------------------
// Failure reasons and details
// ---------------------------------------------------------------------------

export const FERTILIZER_ENRICHMENT_FAILURE_REASONS = [
  'domain_not_ready',
  'technical_failure',
  'no_viable_source',
  'pipeline_failure',
] as const

export type FertilizerEnrichmentFailureReason =
  (typeof FERTILIZER_ENRICHMENT_FAILURE_REASONS)[number]

export type FertilizerReadinessReadyResult = FertilizerReadinessResult & {
  status: 'ready'
}

export type FertilizerReadinessNotReadyResult = FertilizerReadinessResult & {
  status: 'not_ready'
}

export interface FertilizerEnrichmentDomainNotReadyFailureDetail {
  failureReason: 'domain_not_ready'
  readinessResult: FertilizerReadinessNotReadyResult
  normalizationResult?: FertilizerDeclarationNormalizationResult
  readinessInput?: FertilizerProductProfileReadinessInput
}

export interface FertilizerEnrichmentTechnicalFailureDetail {
  failureReason: 'technical_failure'
  technicalError: FertilizerSourceAdapterTechnicalError
  affectedStep: string
  affectedAdapter?: FertilizerSourceAdapterType | null
  partialRawDeclarationInput?: RawFertilizerDeclarationInput | null
  partialAdapterResults?: FertilizerSourceAdapterResult[]
}

export type FertilizerSourceUnavailabilityReason =
  | 'no_match'
  | 'invalid_source'
  | 'adapter_failed'
  | 'skipped'
  | 'not_applicable'

export interface FertilizerSourceAdapterAttemptSummary {
  adapterType: FertilizerSourceAdapterType
  sourceId?: string | null
  status: FertilizerSourceAdapterStatus
  unavailabilityReason?: FertilizerSourceUnavailabilityReason | null
}

export interface FertilizerEnrichmentNoViableSourceFailureDetail {
  failureReason: 'no_viable_source'
  attemptedAdapters: FertilizerSourceAdapterAttemptSummary[]
  recommendedNextAction?: FertilizerSuggestedInputAction
}

export interface FertilizerEnrichmentPipelineFailureDetail {
  failureReason: 'pipeline_failure'
  technicalError: FertilizerSourceAdapterTechnicalError
  pipelineStep: 'normalize' | 'build_readiness_input' | 'evaluate_readiness' | 'unknown'
}

export type FertilizerEnrichmentFailureDetail =
  | FertilizerEnrichmentDomainNotReadyFailureDetail
  | FertilizerEnrichmentTechnicalFailureDetail
  | FertilizerEnrichmentNoViableSourceFailureDetail
  | FertilizerEnrichmentPipelineFailureDetail

export type FertilizerEnrichmentFailedOrchestrationResult =
  FertilizerEnrichmentOrchestrationResultBase &
    FertilizerEnrichmentFailureDetail & {
      status: 'failed'
    }

// ---------------------------------------------------------------------------
// Source adapter types and status
// ---------------------------------------------------------------------------

export const FERTILIZER_SOURCE_ADAPTER_TYPES = [
  'existing_product_profile',
  'manufacturer_product_page',
  'manufacturer_product_document',
  'manufacturer_catalog',
  'packaging',
  'user_document',
  'supplementary_web',
] as const

export type FertilizerSourceAdapterType = (typeof FERTILIZER_SOURCE_ADAPTER_TYPES)[number]

export const FERTILIZER_SOURCE_ADAPTER_STATUSES = [
  'success',
  'partial',
  'no_match',
  'unavailable',
  'invalid_source',
  'failed',
] as const

export type FertilizerSourceAdapterStatus = (typeof FERTILIZER_SOURCE_ADAPTER_STATUSES)[number]

export type FertilizerSourceAdapterSourceType =
  | 'product_profile'
  | 'web_page'
  | 'pdf_document'
  | 'text_document'
  | 'catalog_entry'
  | 'packaging_image'
  | 'packaging_label_text'
  | 'user_upload'
  | 'web_search'

export const FERTILIZER_SOURCE_ADAPTER_ERROR_CODES = [
  'network_error',
  'rate_limited',
  'access_denied',
  'source_not_found',
  'invalid_document',
  'parser_error',
  'unsupported_source',
  'timeout',
  'unknown_adapter_error',
] as const

export type FertilizerSourceAdapterErrorCode =
  (typeof FERTILIZER_SOURCE_ADAPTER_ERROR_CODES)[number]

export interface FertilizerSourceAdapterTechnicalError {
  code: FertilizerSourceAdapterErrorCode
  message: string
  retryable: boolean
  adapterType: FertilizerSourceAdapterType
  sourceId?: string | null
  metadata?: Record<string, string | number | boolean | null>
}

export interface FertilizerSourceAdapterEvidenceRef {
  evidenceId: string
  excerpt: string
  fieldPath?: string | null
}

export interface FertilizerSourceAdapterExtractedNpk {
  nitrogen?: number | null
  phosphate?: number | null
  potash?: number | null
  declarationBasis?: FertilizerNpkDeclarationBasis | null
  rawLabel?: string | null
}

export interface FertilizerSourceAdapterExtractedNutrient {
  key: FertilizerNutrientMatrixKey
  value: number | null
  declarationBasis?: string | null
  unit: '%'
}

export interface FertilizerSourceAdapterCoverageMetadata {
  fieldsCovered: string[]
  nutrientSectionLocated?: boolean
  nutrientSectionFullyCaptured?: boolean
  variantMatched?: boolean
  productScopeConfirmed?: boolean
  coverageNotes?: string | null
}

export interface FertilizerSourceAdapterExtraction {
  extractedIdentity?: Partial<FertilizerEnrichmentIdentity>
  extractedProductForm?: FertilizerEnrichmentProductFormValue
  extractedNpk?: FertilizerSourceAdapterExtractedNpk
  extractedNutrients?: FertilizerSourceAdapterExtractedNutrient[]
  coverageMetadata?: FertilizerSourceAdapterCoverageMetadata
  evidence?: FertilizerSourceAdapterEvidenceRef[]
}

interface FertilizerSourceAdapterResultBase {
  adapterType: FertilizerSourceAdapterType
  sourceId: string
  sourceType: FertilizerSourceAdapterSourceType
  sourceCategory: FertilizerEnrichmentSourceCategory
  sourceUrl?: string | null
  sourceRef?: string | null
  sourceTitle?: string | null
  retrievedAt: string
  sourceVersion?: string | null
  productVariantReference?: string | null
}

export type FertilizerSourceAdapterResult =
  | (FertilizerSourceAdapterResultBase & {
      status: 'success'
      extraction: FertilizerSourceAdapterExtraction
    })
  | (FertilizerSourceAdapterResultBase & {
      status: 'partial'
      extraction: FertilizerSourceAdapterExtraction
    })
  | (FertilizerSourceAdapterResultBase & {
      status: 'no_match'
      reasonCode?: FertilizerSourceUnavailabilityReason | null
    })
  | (FertilizerSourceAdapterResultBase & {
      status: 'unavailable'
      technicalError: FertilizerSourceAdapterTechnicalError
      retryable: boolean
    })
  | (FertilizerSourceAdapterResultBase & {
      status: 'invalid_source'
      reasonCode?: FertilizerSourceUnavailabilityReason | null
      retryable: false
    })
  | (FertilizerSourceAdapterResultBase & {
      status: 'failed'
      technicalError: FertilizerSourceAdapterTechnicalError
      retryable: boolean
    })

// ---------------------------------------------------------------------------
// Retry, timeout, cancellation
// ---------------------------------------------------------------------------

export type FertilizerEnrichmentTimeoutKind = 'none' | 'adapter_timeout' | 'global_timeout'

export interface FertilizerEnrichmentTimeoutState {
  kind: FertilizerEnrichmentTimeoutKind
  startedAt: string
  deadlineAt?: string | null
  timedOut: boolean
  timedOutAdapters: FertilizerSourceAdapterType[]
  completedAdapters: FertilizerSourceAdapterType[]
  cancelledAdapters: FertilizerSourceAdapterType[]
}

export interface FertilizerEnrichmentRetryState {
  attempt: number
  maxAttempts: number
  retryable: boolean
  lastErrorCode?: FertilizerSourceAdapterErrorCode | null
  nextRetryAt?: string | null
  retryExhausted: boolean
}

export type FertilizerEnrichmentCancellationReason =
  | 'user_cancelled'
  | 'session_expired'
  | 'superseded_by_new_run'

export interface FertilizerEnrichmentCancellationMetadata {
  reason: FertilizerEnrichmentCancellationReason
  cancelledAt: string
  cancelledBy?: 'user' | 'system' | null
}

// ---------------------------------------------------------------------------
// Pipeline result (composed from existing types — no lib import)
// ---------------------------------------------------------------------------

export interface FertilizerEnrichmentPipelineResult {
  normalizationResult: FertilizerDeclarationNormalizationResult
  readinessInput: FertilizerProductProfileReadinessInput
  readinessResult: FertilizerReadinessResult
}

export type FertilizerEnrichmentPipelineReadyResult = Omit<
  FertilizerEnrichmentPipelineResult,
  'readinessResult'
> & {
  readinessResult: FertilizerReadinessReadyResult
}

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

export type FertilizerEnrichmentInputChannel = 'capture_flow' | 'manual_retry' | 'additional_source'

export type FertilizerUserProvidedSourceKind =
  | 'packaging_back_photo'
  | 'product_document'
  | 'additional_packaging_photo'
  | 'barcode'
  | 'qr_code'
  | 'other_user_source'

export interface FertilizerUserProvidedSourceRef {
  kind: FertilizerUserProvidedSourceKind
  referenceId: string
  label?: string | null
  productVariantReference?: string | null
}

export interface FertilizerEnrichmentSourceHint {
  sourceUrl?: string | null
  /** Session-scoped reference to a user-provided upload or capture. */
  referenceId?: string | null
  gtin?: string | null
  catalogEntryId?: string | null
  manufacturerCode?: string | null
  hintType?: 'recognition' | 'user' | 'catalog' | null
  /** Explicit adapter assignment — required for adapter-specific source selection. */
  adapterType?: FertilizerSourceAdapterType | null
}

export interface FertilizerEnrichmentOrchestrationReferences {
  recognitionCandidateId?: string | null
  existingProductProfileId?: string | null
  catalogProfileHint?: string | null
  sessionId?: string | null
  correlationId?: string | null
}

/** Structured capture recognition basis — used as packaging fallback when adapters omit fields. */
export interface FertilizerCaptureRecognitionPackagingBasis {
  sourceId: string
  manufacturer: string | null
  officialName: string | null
  productLine: string | null
  variant: string | null
  productForm: FertilizerEnrichmentProductFormValue
  npk: {
    nitrogen: number
    phosphate: number
    potash: number
  } | null
  packageSizeValue?: number | null
  packageSizeUnit?: string | null
}

export interface FertilizerEnrichmentOrchestrationInput {
  objectCategory: FertilizerObjectCategory
  identity: FertilizerEnrichmentIdentity
  references?: FertilizerEnrichmentOrchestrationReferences
  userProvidedSources?: FertilizerUserProvidedSourceRef[]
  allowedInputChannels: FertilizerEnrichmentInputChannel[]
  sourceHints?: FertilizerEnrichmentSourceHint[]
  /** Capture-only inline packaging/label text keyed by referenceId — not persisted as product truth. */
  captureInlineSourceTexts?: Record<string, string>
  /** Capture-only structured recognition basis for merge fallbacks — not persisted as product truth. */
  captureRecognitionPackagingBasis?: FertilizerCaptureRecognitionPackagingBasis
  priorOrchestrationRunId?: string | null
  idempotencyKey?: string | null
  orchestrationRunId?: string | null
}

// ---------------------------------------------------------------------------
// Orchestration result (discriminated union)
// ---------------------------------------------------------------------------

export interface FertilizerEnrichmentOrchestrationResultBase {
  orchestrationRunId: string
  startedAt: string
  completedAt?: string | null
  attemptedAdapters: FertilizerSourceAdapterType[]
  successfulAdapters: FertilizerSourceAdapterType[]
  failedAdapters: FertilizerSourceAdapterType[]
  timeoutState: FertilizerEnrichmentTimeoutState
  retryState?: FertilizerEnrichmentRetryState | null
  technicalErrors: FertilizerSourceAdapterTechnicalError[]
  rawDeclarationInput?: RawFertilizerDeclarationInput | null
  partialAdapterResults?: FertilizerSourceAdapterResult[]
}

export type FertilizerEnrichmentRecognizedResult = FertilizerEnrichmentOrchestrationResultBase & {
  status: 'recognized'
  identity: FertilizerEnrichmentIdentity
}

export type FertilizerEnrichmentEnrichingResult = FertilizerEnrichmentOrchestrationResultBase & {
  status: 'enriching'
}

export type FertilizerEnrichmentNeedsInputResult = FertilizerEnrichmentOrchestrationResultBase & {
  status: 'needs_input'
  recommendedNextAction: FertilizerSuggestedInputAction
  alternativeNextActions?: FertilizerSuggestedInputAction[]
  pipelineResult?: FertilizerEnrichmentPipelineResult | null
}

export type FertilizerEnrichmentIntakeReadyResult = FertilizerEnrichmentOrchestrationResultBase & {
  status: 'intake_ready'
  pipelineResult: FertilizerEnrichmentPipelineReadyResult
}

export type FertilizerEnrichmentCancelledResult = FertilizerEnrichmentOrchestrationResultBase & {
  status: 'cancelled'
  cancellation: FertilizerEnrichmentCancellationMetadata
}

export type FertilizerEnrichmentTimedOutResult = FertilizerEnrichmentOrchestrationResultBase & {
  status: 'timed_out'
  timeoutState: FertilizerEnrichmentTimeoutState & { timedOut: true }
  pipelineResult?: FertilizerEnrichmentPipelineResult | null
  recommendedNextAction?: FertilizerSuggestedInputAction
}

export type FertilizerEnrichmentOrchestrationResult =
  | FertilizerEnrichmentRecognizedResult
  | FertilizerEnrichmentEnrichingResult
  | FertilizerEnrichmentNeedsInputResult
  | FertilizerEnrichmentIntakeReadyResult
  | FertilizerEnrichmentFailedOrchestrationResult
  | FertilizerEnrichmentCancelledResult
  | FertilizerEnrichmentTimedOutResult

// ---------------------------------------------------------------------------
// Fast path assessment (types only)
// ---------------------------------------------------------------------------

export const FERTILIZER_ENRICHMENT_FAST_PATH_DECISIONS = [
  'eligible',
  'ineligible',
  'requires_reenrichment',
] as const

export type FertilizerEnrichmentFastPathDecision =
  (typeof FERTILIZER_ENRICHMENT_FAST_PATH_DECISIONS)[number]

export interface FertilizerEnrichmentFastPathAssessment {
  decision: FertilizerEnrichmentFastPathDecision
  profilePresent: boolean
  identityMatch: boolean
  variantMatch: boolean
  enrichmentVersionCompatible: boolean
  normalizationVersionCompatible: boolean
  readinessVersionCompatible: boolean
  matrixComplete: boolean
  provenanceComplete: boolean
  hasBlockingConflicts: boolean
  staleness: 'unknown' | 'stale' | 'current'
  existingProductProfileId?: string | null
  enrichmentVersion?: typeof FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION
  normalizationVersion?: FertilizerDeclarationNormalizationSpecificationVersion
  readinessVersion?: FertilizerReadinessSpecificationVersion
}

// ---------------------------------------------------------------------------
// Idempotency (types only)
// ---------------------------------------------------------------------------

export const FERTILIZER_ENRICHMENT_IDEMPOTENCY_DECISIONS = [
  'start_new',
  'reuse_existing',
  'continue_existing',
] as const

export type FertilizerEnrichmentIdempotencyDecision =
  (typeof FERTILIZER_ENRICHMENT_IDEMPOTENCY_DECISIONS)[number]

export interface FertilizerEnrichmentIdempotencyContext {
  idempotencyKey: string
  identityFingerprint: string
  variantReference?: string | null
  sourceFingerprint?: string | null
  existingJobId?: string | null
  decision: FertilizerEnrichmentIdempotencyDecision
}

// ---------------------------------------------------------------------------
// Observability metadata (types only)
// ---------------------------------------------------------------------------

export interface FertilizerEnrichmentAdapterTiming {
  adapterType: FertilizerSourceAdapterType
  durationMs: number
  status: FertilizerSourceAdapterStatus
}

export interface FertilizerEnrichmentObservabilityMetadata {
  totalDurationMs: number
  adapterTimings: FertilizerEnrichmentAdapterTiming[]
  retryCount: number
  timeoutKind: FertilizerEnrichmentTimeoutKind
  resultingReadinessStatus?: FertilizerReadinessResult['status'] | null
  topMissingRequirements?: FertilizerMissingRequirementKey[]
  failureReason?: FertilizerEnrichmentFailureReason | null
}

// ---------------------------------------------------------------------------
// Access context (discriminated — authorization, not inventory)
// ---------------------------------------------------------------------------

export const FERTILIZER_ENRICHMENT_ACCESS_CONTEXT_KINDS = [
  'authenticated_user',
  'session',
] as const

export type FertilizerEnrichmentAccessContextKind =
  (typeof FERTILIZER_ENRICHMENT_ACCESS_CONTEXT_KINDS)[number]

export type FertilizerEnrichmentAccessContext =
  | {
      kind: 'authenticated_user'
      userId: string
      sessionId?: string | null
    }
  | {
      kind: 'session'
      sessionId: string
    }

// ---------------------------------------------------------------------------
// Job contract (types only — no persistence)
// ---------------------------------------------------------------------------

/** Technical job envelope — canonical orchestration state lives in {@link FertilizerEnrichmentJob.result}. */
export interface FertilizerEnrichmentJob {
  jobId: string
  orchestrationRunId: string
  idempotencyKey: string
  accessContext: FertilizerEnrichmentAccessContext
  objectCategory: FertilizerObjectCategory
  identityFingerprint: string
  createdAt: string
  updatedAt: string
  expiresAt?: string | null
  /** Canonical orchestration state — current status is always `result.status`. */
  result: FertilizerEnrichmentOrchestrationResult
}

// ---------------------------------------------------------------------------
// API boundary types (Phase 3a — no endpoints)
// ---------------------------------------------------------------------------

export const FERTILIZER_ENRICHMENT_API_ERROR_CODES = [
  'unsupported_object_category',
  'invalid_request',
  'job_not_found',
  'job_expired',
  'unauthorized',
  'idempotency_conflict',
  'revision_conflict',
  'orchestration_not_cancellable',
  'internal_server_error',
  'temporarily_unavailable',
] as const

export type FertilizerEnrichmentApiErrorCode =
  (typeof FERTILIZER_ENRICHMENT_API_ERROR_CODES)[number]

export interface FertilizerEnrichmentApiError {
  code: FertilizerEnrichmentApiErrorCode
  message: string
}

export interface StartFertilizerEnrichmentRequest {
  input: FertilizerEnrichmentOrchestrationInput
  accessContext: FertilizerEnrichmentAccessContext
  idempotencyKey: string
}

export interface StartFertilizerEnrichmentResponse {
  job: FertilizerEnrichmentJob
}

export interface GetFertilizerEnrichmentStatusRequest {
  jobId: string
  accessContext: FertilizerEnrichmentAccessContext
}

export interface GetFertilizerEnrichmentStatusResponse {
  job: FertilizerEnrichmentJob
}

export interface ProvideFertilizerAdditionalSourceRequest {
  jobId: string
  accessContext: FertilizerEnrichmentAccessContext
  idempotencyKey: string
  additionalSources: FertilizerUserProvidedSourceRef[]
  priorOrchestrationRunId?: string | null
}

export interface ProvideFertilizerAdditionalSourceResponse {
  job: FertilizerEnrichmentJob
}

export interface CancelFertilizerEnrichmentRequest {
  jobId: string
  accessContext: FertilizerEnrichmentAccessContext
}

export interface CancelFertilizerEnrichmentResponse {
  job: FertilizerEnrichmentJob
}

// ---------------------------------------------------------------------------
// Version re-exports for fast-path compatibility checks (no new version)
// ---------------------------------------------------------------------------

export {
  FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
  FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
  FERTILIZER_READINESS_SPECIFICATION_VERSION,
}
