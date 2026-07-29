import type {
  FertilizerConflictResolutionStatus,
  FertilizerEnrichmentConflict,
  FertilizerEnrichmentConflictValue,
  FertilizerEnrichmentNormalization,
  FertilizerEnrichmentProductFormValue,
  FertilizerEnrichmentProvenance,
  FertilizerEnrichmentResult,
  FertilizerEnrichmentSourceCategory,
} from './fertilizerEnrichment'
import {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  type FertilizerNpkDeclarationBasis,
  type FertilizerNutrientMatrixKey,
  type FertilizerObjectCategory,
} from './fertilizerReadiness'

export { FERTILIZER_NUTRIENT_MATRIX_KEYS }

export const FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION =
  'fertilizer-declaration-normalization-v1' as const

export type FertilizerDeclarationNormalizationSpecificationVersion =
  typeof FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION

export type FertilizerDeclarationNormalizationStatus =
  | 'normalized'
  | 'partially_normalized'
  | 'blocked'

export const FERTILIZER_DECLARATION_NORMALIZATION_STATUSES = [
  'normalized',
  'partially_normalized',
  'blocked',
] as const satisfies readonly FertilizerDeclarationNormalizationStatus[]

/**
 * Controlled extraction state for a raw declaration field.
 * `not_declared` is not DL-014 zero — Phase 2b may map it to `dl014_zero` only after `fully_evaluated`.
 */
export type RawFertilizerDeclarationValueStatus =
  | 'declared'
  | 'not_declared'
  | 'unreadable'
  | 'not_extracted'
  | 'conflicting'
  | 'basis_unknown'

export const RAW_FERTILIZER_DECLARATION_VALUE_STATUSES = [
  'declared',
  'not_declared',
  'unreadable',
  'not_extracted',
  'conflicting',
  'basis_unknown',
] as const satisfies readonly RawFertilizerDeclarationValueStatus[]

export interface RawFertilizerDeclarationValue {
  status: RawFertilizerDeclarationValueStatus
  /** Numeric value when `status === 'declared'`; `0` is valid. Omitted when not applicable. */
  value?: number | null
  declarationBasis?: string | null
  provenanceIds?: string[]
  conflictIds?: string[]
}

export type FertilizerSourceEvaluationStatus =
  | 'not_started'
  | 'source_partial'
  | 'source_fully_evaluated'

export const FERTILIZER_SOURCE_EVALUATION_STATUSES = [
  'not_started',
  'source_partial',
  'source_fully_evaluated',
] as const satisfies readonly FertilizerSourceEvaluationStatus[]

/**
 * Structured coverage metadata for deterministic `fully_evaluated` derivation in Phase 2b.
 * Phase 2a defines the contract only — no computation.
 */
export interface RawFertilizerDeclarationCoverageMetadata {
  sourceEvaluationStatus: FertilizerSourceEvaluationStatus
  evaluatedSourceIds: string[]
  productScopeConfirmed: boolean
  variantMatched: boolean
  nutrientSectionLocated: boolean
  nutrientSectionFullyCaptured: boolean
  declarationBasisResolved: boolean
  hasBlockingDeclarationConflict: boolean
  coverageNotes?: string | null
}

/** Field-level provenance — extends Phase-1b enrichment provenance with normalization context. */
export interface FertilizerFieldProvenance extends Omit<
  FertilizerEnrichmentProvenance,
  'sourceCategory'
> {
  fieldPath: string
  sourceCategory: FertilizerEnrichmentSourceCategory
  productVariantReference?: string | null
  sourceVersion?: string | null
  isPrimary?: boolean
  /** Set by the normalizer in Phase 2b — omitted on raw provenance records. */
  normalization?: FertilizerEnrichmentNormalization | null
}

/**
 * Strict Phase-2 conflict contract — required metadata for deterministic normalization.
 * Builds on {@link FertilizerEnrichmentConflict} without a parallel conflict model.
 */
export interface FertilizerDeclarationConflict
  extends Omit<
    FertilizerEnrichmentConflict,
    'conflictId' | 'participantProvenanceIds' | 'values' | 'resolutionStatus' | 'reasonCode' | 'code'
  > {
  conflictId: string
  /** Participating source / provenance IDs for this conflict. */
  sourceIds: string[]
  values: FertilizerEnrichmentConflictValue[]
  resolutionStatus: FertilizerConflictResolutionStatus
  reasonCode: string
}

export interface RawFertilizerDeclarationIdentity {
  manufacturer: string | null
  officialName: string | null
  productLine?: string | null
  variant: string | null
  identityFingerprint: string | null
  identityConfidence: number | null
  hasIdentityAmbiguity: boolean
  identityAmbiguityResolvable?: boolean
  identityNotActionable?: boolean
}

export interface RawFertilizerDeclarationProductForm {
  value: FertilizerEnrichmentProductFormValue
  provenanceIds?: string[]
  conflictIds?: string[]
}

export interface RawFertilizerDeclarationNpk {
  nitrogen?: RawFertilizerDeclarationValue | null
  phosphate?: RawFertilizerDeclarationValue | null
  potash?: RawFertilizerDeclarationValue | null
  declarationBasis?: FertilizerNpkDeclarationBasis | null
  provenanceIds?: string[]
  conflictIds?: string[]
}

export type RawFertilizerDeclarationNutrientMatrix = Partial<
  Record<FertilizerNutrientMatrixKey, RawFertilizerDeclarationValue | null | undefined>
>

/**
 * Structured pre-normalization declaration input for `normalizeFertilizerDeclaration()` (Phase 2b).
 * Alias aligns with GA-014 §12 naming.
 */
export interface RawFertilizerDeclarationInput {
  objectCategory: FertilizerObjectCategory | string
  identity: RawFertilizerDeclarationIdentity
  productForm: RawFertilizerDeclarationProductForm
  npk: RawFertilizerDeclarationNpk
  nutrientMatrix: RawFertilizerDeclarationNutrientMatrix
  coverageMetadata: RawFertilizerDeclarationCoverageMetadata
  provenanceRecords: Record<string, FertilizerFieldProvenance>
  sourceConflicts: FertilizerDeclarationConflict[]
  enrichmentRunId?: string
  extractedAt?: string
}

/** GA-014 §12 alias — same contract as {@link RawFertilizerDeclarationInput}. */
export type RawFertilizerEnrichmentResult = RawFertilizerDeclarationInput

/** Optional normalized enrichment extensions — applied to output in Phase 2b/2c. */
export interface FertilizerNormalizedEnrichmentExtensions {
  normalizationRunId: string
  normalizedAt: string
  normalizationStatus: FertilizerDeclarationNormalizationStatus
  normalizationRulesVersion: FertilizerDeclarationNormalizationSpecificationVersion
  provenanceRecords: Record<string, FertilizerFieldProvenance>
}

/** Normalized enrichment output — canonical home for conflicts and provenance. */
export type NormalizedFertilizerEnrichmentResult = Omit<
  FertilizerEnrichmentResult,
  'sourceConflicts'
> &
  FertilizerNormalizedEnrichmentExtensions & {
    sourceConflicts: FertilizerDeclarationConflict[]
  }

/**
 * Normalizer output envelope (Phase 2b) — types only in Phase 2a; no production yet.
 * Conflicts and provenance are accessed exclusively via `enrichmentResult`.
 */
export interface FertilizerDeclarationNormalizationResult {
  status: FertilizerDeclarationNormalizationStatus
  enrichmentResult: NormalizedFertilizerEnrichmentResult
  normalizationSpecificationVersion: FertilizerDeclarationNormalizationSpecificationVersion
  normalizedAt: string
  normalizationRunId: string
}
