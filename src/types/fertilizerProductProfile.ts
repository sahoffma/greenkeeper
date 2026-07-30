import type { ProductProfileForm } from './productProfile'
import type {
  FertilizerNpkDeclarationBasis,
  FertilizerNutrientMatrix,
  FertilizerNutrientMatrixKey,
} from './fertilizerReadiness'

export const FERTILIZER_COMPOSITION_FINGERPRINT_VERSION = 'fertilizer-composition-v1' as const

export type FertilizerCompositionFingerprintVersion =
  typeof FERTILIZER_COMPOSITION_FINGERPRINT_VERSION

export const FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE = 'enrichment' as const

export type FertilizerSavedProductProfileSource = typeof FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE

export const FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS = 'saved' as const

export type FertilizerSavedProductProfileStatus = typeof FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS

export type FertilizerSavedProductProfileAccessKind = 'authenticated_user' | 'session'

export interface FertilizerProductVersionProjectionNpk {
  nitrogen: string
  phosphate: string
  potash: string
  declarationBasis: FertilizerNpkDeclarationBasis
}

export interface FertilizerProductVersionProjection {
  fingerprintVersion: FertilizerCompositionFingerprintVersion
  productForm: ProductProfileForm
  npk: FertilizerProductVersionProjectionNpk
  nutrientMatrix: Record<FertilizerNutrientMatrixKey, string>
}

export interface FertilizerSavedProductProfileProvenance {
  enrichmentJobId?: string | null
  confirmedAt: string
  sourceAdapterTypes?: string[]
}

/** Immutable enrichment-saved product version (Product Profile). */
export interface FertilizerSavedProductProfile {
  id: string
  accessKind: FertilizerSavedProductProfileAccessKind
  userId: string | null
  sessionAccessHash: string | null
  productFamilyKey: string
  identityFingerprint: string
  manufacturer: string | null
  productLine: string | null
  officialName: string | null
  variant: string | null
  productForm: ProductProfileForm
  npkDeclaration: string | null
  nitrogen: number
  phosphate: number
  potash: number
  nutrientMatrix: FertilizerNutrientMatrix
  compositionFingerprintVersion: FertilizerCompositionFingerprintVersion
  compositionFingerprint: string
  provenance: FertilizerSavedProductProfileProvenance
  saveIdempotencyKey: string
  source: FertilizerSavedProductProfileSource
  profileStatus: FertilizerSavedProductProfileStatus
  verificationStatus: 'verified'
  createdAt: string
}

export interface FertilizerSavedProductProfilePublic {
  id: string
  manufacturer: string | null
  productLine: string | null
  officialName: string | null
  variant: string | null
  productForm: ProductProfileForm
  npkDeclaration: string | null
  nitrogen: number
  phosphate: number
  potash: number
  nutrientMatrix: FertilizerNutrientMatrix
  createdAt: string
}
