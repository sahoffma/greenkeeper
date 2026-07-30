import type { FertilizerEnrichmentNutrientMatrix } from '../types/fertilizerEnrichment'
import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerEnrichmentIntakeReadyResult } from '../types/fertilizerEnrichmentOrchestration'
import {
  FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
  FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
  type FertilizerSavedProductProfile,
  type FertilizerSavedProductProfilePublic,
} from '../types/fertilizerProductProfile'
import {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  type FertilizerNutrientMatrix,
} from '../types/fertilizerReadiness'
import { computeFertilizerCompositionFingerprint } from './fertilizerCompositionFingerprintCore'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import {
  FertilizerProductVersionProjectionError,
  buildFertilizerNpkDeclarationLabel,
  buildFertilizerProductFamilyKey,
  projectFertilizerProductVersionFromPipeline,
} from './fertilizerProductVersionProjectionCore'
import {
  FertilizerProductProfileRepositoryError,
  type FertilizerProductProfileRepository,
} from './fertilizerProductProfileRepositoryCore'
import { createRandomId } from './randomId'

export const FERTILIZER_PRODUCT_PROFILE_SAVE_ERROR_CODES = [
  'unconfirmed_save',
  'not_save_ready',
  'unsupported_object_category',
  'invalid_declaration',
  'incomplete_projection',
  'unsupported_fingerprint_version',
  'invalid_stored_record',
  'persistence_unavailable',
  'idempotency_conflict',
] as const

export type FertilizerProductProfileSaveErrorCode =
  (typeof FERTILIZER_PRODUCT_PROFILE_SAVE_ERROR_CODES)[number]

export class FertilizerProductProfileSaveError extends Error {
  readonly code: FertilizerProductProfileSaveErrorCode

  constructor(code: FertilizerProductProfileSaveErrorCode, message: string) {
    super(message)
    this.name = 'FertilizerProductProfileSaveError'
    this.code = code
  }
}

export interface FertilizerProductProfileSaveInput {
  intakeReadyResult: FertilizerEnrichmentIntakeReadyResult
  accessContext: FertilizerEnrichmentAccessContext
  userConfirmed: boolean
  idempotencyKey: string
  enrichmentJobId?: string | null
  /** Non-version metadata — ignored for composition fingerprint (DL-018). */
  packSizeLabel?: string | null
  packagingType?: string | null
  remainderQuantity?: number | null
}

export interface FertilizerProductProfileSaveDependencies {
  repository: FertilizerProductProfileRepository
  deriveSessionAccessHash: DeriveSessionAccessHash
  now?: () => string
  createId?: () => string
}

export interface FertilizerProductProfileSaveResult {
  profile: FertilizerSavedProductProfile
  publicProfile: FertilizerSavedProductProfilePublic
  reusedExistingVersion: boolean
}

function mapSaveError(error: unknown): FertilizerProductProfileSaveError {
  if (error instanceof FertilizerProductProfileSaveError) {
    return error
  }

  if (error instanceof FertilizerProductVersionProjectionError) {
    const code =
      error.code === 'unsupported_object_category'
        ? 'unsupported_object_category'
        : error.code === 'invalid_declaration'
          ? 'invalid_declaration'
          : error.code === 'incomplete_projection'
            ? 'incomplete_projection'
            : 'not_save_ready'

    return new FertilizerProductProfileSaveError(code, error.message)
  }

  if (error instanceof FertilizerProductProfileRepositoryError) {
    if (error.code === 'invalid_stored_record') {
      return new FertilizerProductProfileSaveError('invalid_stored_record', error.message)
    }

    if (error.code === 'version_unique_conflict') {
      return new FertilizerProductProfileSaveError('idempotency_conflict', error.message)
    }

    return new FertilizerProductProfileSaveError('persistence_unavailable', error.message)
  }

  return new FertilizerProductProfileSaveError(
    'persistence_unavailable',
    'Product profile save failed.',
  )
}

function parseProjectionDecimal(value: string): number {
  return Number(value)
}

function mapEnrichmentNutrientMatrixToSaved(
  matrix: FertilizerEnrichmentNutrientMatrix,
): FertilizerNutrientMatrix {
  const saved: FertilizerNutrientMatrix = {}

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const entry = matrix[key]
    if (entry?.value == null || entry.normalization === 'unresolved') {
      continue
    }

    saved[key] = {
      value: entry.value,
      unit: '%',
      declarationBasis: entry.declarationBasis ?? 'N',
    }
  }

  return saved
}

export function toPublicFertilizerSavedProductProfile(
  profile: FertilizerSavedProductProfile,
): FertilizerSavedProductProfilePublic {
  return {
    id: profile.id,
    manufacturer: profile.manufacturer,
    productLine: profile.productLine,
    officialName: profile.officialName,
    variant: profile.variant,
    productForm: profile.productForm,
    npkDeclaration: profile.npkDeclaration,
    nitrogen: profile.nitrogen,
    phosphate: profile.phosphate,
    potash: profile.potash,
    nutrientMatrix: profile.nutrientMatrix,
    createdAt: profile.createdAt,
  }
}

export async function saveConfirmedFertilizerProductProfile(
  input: FertilizerProductProfileSaveInput,
  dependencies: FertilizerProductProfileSaveDependencies,
): Promise<FertilizerProductProfileSaveResult> {
  try {
    if (!input.userConfirmed) {
      throw new FertilizerProductProfileSaveError(
        'unconfirmed_save',
        'Product profile save requires explicit user confirmation.',
      )
    }

    if (input.intakeReadyResult.status !== 'intake_ready') {
      throw new FertilizerProductProfileSaveError(
        'not_save_ready',
        'Product profile save requires an intake-ready enrichment result.',
      )
    }

    if (!input.idempotencyKey.trim()) {
      throw new FertilizerProductProfileSaveError(
        'invalid_declaration',
        'Product profile save requires a non-empty idempotency key.',
      )
    }

    const pipelineResult = input.intakeReadyResult.pipelineResult
    const projection = projectFertilizerProductVersionFromPipeline(pipelineResult)
    const { compositionFingerprint, compositionFingerprintVersion } =
      computeFertilizerCompositionFingerprint(projection)

    const enrichment = pipelineResult.normalizationResult.enrichmentResult
    const productFamilyKey = buildFertilizerProductFamilyKey(enrichment.identity)
    if (!productFamilyKey || !enrichment.identity.identityFingerprint) {
      throw new FertilizerProductProfileSaveError(
        'incomplete_projection',
        'Product profile save requires a complete product identity.',
      )
    }

    const existingByIdempotency = await dependencies.repository.findBySaveIdempotencyKey(
      input.idempotencyKey,
      input.accessContext,
    )
    if (existingByIdempotency) {
      return {
        profile: existingByIdempotency,
        publicProfile: toPublicFertilizerSavedProductProfile(existingByIdempotency),
        reusedExistingVersion: true,
      }
    }

    const existingByVersion = await dependencies.repository.findByIdentityAndCompositionFingerprint(
      {
        productFamilyKey,
        compositionFingerprintVersion,
        compositionFingerprint,
      },
      input.accessContext,
    )
    if (existingByVersion) {
      return {
        profile: existingByVersion,
        publicProfile: toPublicFertilizerSavedProductProfile(existingByVersion),
        reusedExistingVersion: true,
      }
    }

    const now = dependencies.now?.() ?? new Date().toISOString()
    const createId = dependencies.createId ?? createRandomId

    const profile: FertilizerSavedProductProfile = {
      id: createId(),
      accessKind:
        input.accessContext.kind === 'authenticated_user' ? 'authenticated_user' : 'session',
      userId:
        input.accessContext.kind === 'authenticated_user' ? input.accessContext.userId : null,
      sessionAccessHash:
        input.accessContext.kind === 'session'
          ? dependencies.deriveSessionAccessHash(input.accessContext.sessionId)
          : null,
      productFamilyKey,
      identityFingerprint: enrichment.identity.identityFingerprint,
      manufacturer: enrichment.identity.manufacturer,
      productLine: enrichment.identity.productLine ?? null,
      officialName: enrichment.identity.officialName,
      variant: enrichment.identity.variant,
      productForm: projection.productForm,
      npkDeclaration: buildFertilizerNpkDeclarationLabel(projection),
      nitrogen: parseProjectionDecimal(projection.npk.nitrogen),
      phosphate: parseProjectionDecimal(projection.npk.phosphate),
      potash: parseProjectionDecimal(projection.npk.potash),
      nutrientMatrix: mapEnrichmentNutrientMatrixToSaved(enrichment.nutrientMatrix),
      compositionFingerprintVersion,
      compositionFingerprint,
      provenance: {
        enrichmentJobId: input.enrichmentJobId ?? null,
        confirmedAt: now,
      },
      saveIdempotencyKey: input.idempotencyKey,
      source: FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
      profileStatus: FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
      verificationStatus: 'verified',
      createdAt: now,
    }

    const saved = await dependencies.repository.saveNewVersion(profile, input.accessContext)

    return {
      profile: saved,
      publicProfile: toPublicFertilizerSavedProductProfile(saved),
      reusedExistingVersion: saved.id !== profile.id,
    }
  } catch (error) {
    throw mapSaveError(error)
  }
}
