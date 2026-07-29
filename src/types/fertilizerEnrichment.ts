import type { ProductProfileForm } from './productProfile'
import {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  type DeclarationEvaluationStatus,
  type FertilizerNpkDeclarationBasis,
  type FertilizerNutrientMatrixKey,
  type FertilizerObjectCategory,
  type FertilizerSuggestedInputAction,
} from './fertilizerReadiness'

export { FERTILIZER_NUTRIENT_MATRIX_KEYS }

export const FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION = 'fertilizer-enrichment-v1' as const

export type FertilizerEnrichmentSpecificationVersion =
  typeof FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION

export type FertilizerEnrichmentSourceType =
  | 'manufacturer_page'
  | 'product_document'
  | 'catalog'
  | 'packaging'
  | 'user_document'
  | 'other'

export type FertilizerEnrichmentSourceCategory =
  | 'official_manufacturer'
  | 'official_document'
  | 'official_catalog'
  | 'packaging_evidence'
  | 'user_provided'
  | 'supplementary'

export type FertilizerEnrichmentNormalization = 'declared' | 'dl014_zero' | 'unresolved'

export type FertilizerEnrichmentConflictType =
  | 'identity_conflict'
  | 'variant_conflict'
  | 'product_form_conflict'
  | 'npk_conflict'
  | 'declaration_basis_conflict'
  | 'nutrient_value_conflict'
  | 'source_version_conflict'

export type FertilizerEnrichmentConflictStatus =
  | 'none'
  | 'blocking_resolvable'
  | 'blocking_unresolvable'
  | 'non_blocking'

export interface FertilizerEnrichmentProvenance {
  provenanceId: string
  sourceType: FertilizerEnrichmentSourceType
  sourceCategory: FertilizerEnrichmentSourceCategory | null
  sourceUrl: string | null
  sourceTitle: string | null
  evidence: string | null
  retrievedAt: string
  confidence: number | null
}

export interface FertilizerEnrichmentIdentity {
  manufacturer: string | null
  officialName: string | null
  productLine?: string | null
  variant: string | null
  identityFingerprint: string | null
  identityConfidence: number | null
  hasIdentityAmbiguity: boolean
  identityAmbiguityResolvable?: boolean
  identityNotActionable?: boolean
  identityAmbiguityCandidateCount?: number
  identityAmbiguityConflictReason?: string | null
}

export type FertilizerEnrichmentProductFormValue = ProductProfileForm | 'unknown' | null

export interface FertilizerEnrichmentProductForm {
  value: FertilizerEnrichmentProductFormValue
  provenanceId?: string | null
  evidence?: string | null
  sourceUrl?: string | null
  sourceCategory?: FertilizerEnrichmentSourceCategory | null
  confidence?: number | null
}

export interface FertilizerEnrichmentNpk {
  nitrogen: number | null | undefined
  phosphate: number | null | undefined
  potash: number | null | undefined
  declarationBasis: FertilizerNpkDeclarationBasis | null
  provenanceId?: string | null
  evidence?: string | null
  sourceUrl?: string | null
  sourceCategory?: FertilizerEnrichmentSourceCategory | null
  confidence?: number | null
}

export interface FertilizerEnrichmentNutrientEntry {
  value: number | null | undefined
  declarationBasis: string | null
  unit: '%'
  normalization: FertilizerEnrichmentNormalization | null
  provenanceId: string | null
  evidence: string | null
  sourceUrl: string | null
  sourceCategory: FertilizerEnrichmentSourceCategory | null
  confidence: number | null
  conflictStatus: FertilizerEnrichmentConflictStatus | null
}

export type FertilizerEnrichmentNutrientMatrix = Record<
  FertilizerNutrientMatrixKey,
  FertilizerEnrichmentNutrientEntry | null | undefined
>

export interface FertilizerEnrichmentDeclarationEvaluation {
  status: DeclarationEvaluationStatus
  evaluatedSourceIds?: string[]
  coverageNotes?: string | null
  variantResolved?: boolean
  productScopeConfirmed?: boolean
  evaluatedAt?: string | null
}

export interface FertilizerEnrichmentConflict {
  type: FertilizerEnrichmentConflictType
  fieldPath: string
  blocking: boolean
  resolvable: boolean
  participantProvenanceIds: string[]
  suggestedInputAction?: FertilizerSuggestedInputAction
  code?: string
}

export interface FertilizerEnrichmentApplication {
  recommendedRateMin?: number | null
  recommendedRateMax?: number | null
  rateUnit?: string | null
  applicationPeriod?: unknown
  longevity?: { value: number; unit: string } | null
  applicationHints?: string[]
  provenanceId?: string | null
}

export interface FertilizerEnrichmentResult {
  objectCategory: FertilizerObjectCategory | string
  specificationVersion: FertilizerEnrichmentSpecificationVersion
  identity: FertilizerEnrichmentIdentity
  productForm: FertilizerEnrichmentProductForm
  npk: FertilizerEnrichmentNpk
  nutrientMatrix: FertilizerEnrichmentNutrientMatrix
  declarationEvaluation: FertilizerEnrichmentDeclarationEvaluation
  sourceConflicts: FertilizerEnrichmentConflict[]
  application?: FertilizerEnrichmentApplication
  enrichmentRunId: string
  enrichedAt: string
}
