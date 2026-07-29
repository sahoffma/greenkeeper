import type { ProductProfileForm } from './productProfile'

export const FERTILIZER_READINESS_SPECIFICATION_VERSION = 'fertilizer-readiness-v1' as const

export type FertilizerReadinessSpecificationVersion =
  typeof FERTILIZER_READINESS_SPECIFICATION_VERSION

export type FertilizerObjectCategory = 'fertilizer'

export type FertilizerReadinessStatus = 'ready' | 'needs_input' | 'not_ready'

export type DeclarationEvaluationStatus =
  | 'not_started'
  | 'insufficient_sources'
  | 'fully_evaluated'

export type FertilizerMissingRequirementKey =
  | 'identity.manufacturer'
  | 'identity.official_name'
  | 'identity.variant'
  | 'identity.fingerprint'
  | 'identity.ambiguity'
  | 'basis.product_form'
  | 'basis.npk'
  | 'basis.npk.declaration_basis'
  | 'basis.npk.exception'
  | 'ingredients.declaration_source'
  | 'ingredients.matrix'
  | 'sources.conflict'

export type FertilizerSuggestedInputAction =
  | 'upload_back_photo'
  | 'upload_product_document'
  | 'capture_additional_packaging_photo'
  | 'confirm_product_variant'
  | 'confirm_product_form'
  | 'retry_recognition'
  | 'manual_fallback_input'

export type FertilizerBlockingIssueCode =
  | 'sources.conflict'
  | 'identity.not_actionable'

export interface FertilizerBlockingIssue {
  code: FertilizerBlockingIssueCode
}

export interface FertilizerIdentityAmbiguity {
  isAmbiguous: boolean
  candidateCount?: number
  conflictReason?: string | null
}

export interface FertilizerReadinessIdentity {
  manufacturer: string | null
  officialName: string | null
  variant?: string | null
  identityFingerprint: string | null
  identityConfidence?: number
  identityAmbiguity: FertilizerIdentityAmbiguity
  /** When ambiguous: `false` → `not_ready`; `true` or omitted → `needs_input`. */
  identityAmbiguityResolvable?: boolean
  /** Explicit severe identity failure → `not_ready`. */
  identityNotActionable?: boolean
}

export interface FertilizerNpkDeclarationBasis {
  nitrogen: 'N'
  phosphate: 'P2O5'
  potash: 'K2O'
}

export interface FertilizerReadinessNpk {
  nitrogen: number | null
  phosphate: number | null
  potash: number | null
  declarationBasis: FertilizerNpkDeclarationBasis | null
}

export interface FertilizerNutrientValue {
  value: number
  unit: '%'
  declarationBasis: string
}

export const FERTILIZER_NUTRIENT_MATRIX_KEYS = [
  'nitrogen',
  'phosphate',
  'potash',
  'nitrateNitrogen',
  'ammoniumNitrogen',
  'ureaNitrogen',
  'organicNitrogen',
  'magnesium',
  'calcium',
  'sulfur',
  'iron',
  'manganese',
  'copper',
  'zinc',
  'boron',
  'molybdenum',
] as const

export type FertilizerNutrientMatrixKey = (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number]

export type FertilizerNutrientMatrix = Partial<
  Record<FertilizerNutrientMatrixKey, FertilizerNutrientValue | null | undefined>
>

export interface FertilizerDeclarationEvaluation {
  status: DeclarationEvaluationStatus
}

export interface FertilizerBlockingSourceConflict {
  blocking: boolean
  resolvable: boolean
}

/** Product form including non-intake values from recognition; intake requires granular | liquid. */
export type FertilizerReadinessProductForm = ProductProfileForm | 'unknown' | null

export interface FertilizerProductProfileReadinessInput {
  objectCategory: FertilizerObjectCategory | string
  identity: FertilizerReadinessIdentity
  productForm: FertilizerReadinessProductForm
  npk: FertilizerReadinessNpk
  nutrientMatrix: FertilizerNutrientMatrix
  declarationEvaluation: FertilizerDeclarationEvaluation
  blockingSourceConflict?: FertilizerBlockingSourceConflict | null
}

export interface FertilizerReadinessResult {
  status: FertilizerReadinessStatus
  missingRequirements: FertilizerMissingRequirementKey[]
  fulfilledRequirements: FertilizerMissingRequirementKey[]
  blockingIssues: FertilizerBlockingIssue[]
  suggestedInputActions: FertilizerSuggestedInputAction[]
  evaluatedAt: string
  specificationVersion: FertilizerReadinessSpecificationVersion
}

export interface EvaluateFertilizerReadinessOptions {
  evaluatedAt?: string
}

export const FERTILIZER_READINESS_CONTRACT_ERROR_CODE = 'unsupported_object_category' as const

export type FertilizerReadinessContractErrorCode =
  typeof FERTILIZER_READINESS_CONTRACT_ERROR_CODE
