import type {
  FertilizerEnrichmentConflict,
  FertilizerEnrichmentNutrientEntry,
  FertilizerEnrichmentNutrientMatrix,
  FertilizerEnrichmentResult,
} from '../types/fertilizerEnrichment'
import {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  type FertilizerBlockingSourceConflict,
  type FertilizerNutrientMatrix,
  type FertilizerNutrientValue,
  type FertilizerProductProfileReadinessInput,
  type FertilizerReadinessIdentity,
  type FertilizerReadinessNpk,
} from '../types/fertilizerReadiness'

export { FERTILIZER_NUTRIENT_MATRIX_KEYS }

/**
 * Phase 1b: mechanical aggregation only — no conflict resolution or prioritization.
 * - No blocking conflicts → null
 * - All blocking conflicts resolvable → { blocking: true, resolvable: true }
 * - Any blocking unresolvable → { blocking: true, resolvable: false }
 */
export function aggregateBlockingSourceConflict(
  conflicts: FertilizerEnrichmentConflict[],
): FertilizerBlockingSourceConflict | null {
  const blockingConflicts = conflicts.filter((conflict) => conflict.blocking)

  if (blockingConflicts.length === 0) {
    return null
  }

  const hasUnresolvable = blockingConflicts.some((conflict) => !conflict.resolvable)

  return {
    blocking: true,
    resolvable: !hasUnresolvable,
  }
}

/** Maps one enrichment matrix entry — no DL-014 normalization or value correction. */
export function mapEnrichmentNutrientEntryToReadiness(
  entry: FertilizerEnrichmentNutrientEntry | null | undefined,
): FertilizerNutrientValue | null | undefined {
  if (entry === undefined) {
    return undefined
  }

  if (entry === null) {
    return null
  }

  if (entry.value === undefined) {
    return undefined
  }

  if (entry.value === null) {
    return null
  }

  return {
    value: entry.value,
    unit: '%',
    declarationBasis: entry.declarationBasis ?? '',
  }
}

/** Explicit mapping for all 16 GM-009 v1 matrix keys — no dynamic key iteration at runtime beyond the fixed key list. */
export function mapEnrichmentNutrientMatrixToReadiness(
  matrix: FertilizerEnrichmentNutrientMatrix,
): FertilizerNutrientMatrix {
  const result = {} as FertilizerNutrientMatrix

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    result[key] = mapEnrichmentNutrientEntryToReadiness(matrix[key])
  }

  return result
}

function mapIdentity(identity: FertilizerEnrichmentResult['identity']): FertilizerReadinessIdentity {
  return {
    manufacturer: identity.manufacturer,
    officialName: identity.officialName,
    variant: identity.variant,
    identityFingerprint: identity.identityFingerprint,
    identityConfidence: identity.identityConfidence ?? undefined,
    identityAmbiguity: {
      isAmbiguous: identity.hasIdentityAmbiguity,
      candidateCount: identity.identityAmbiguityCandidateCount,
      conflictReason: identity.identityAmbiguityConflictReason,
    },
    identityAmbiguityResolvable: identity.identityAmbiguityResolvable,
    identityNotActionable: identity.identityNotActionable,
  }
}

/**
 * Pure field adapter: Enrichment → Readiness input.
 * Does not normalize, infer 0, resolve conflicts, or call the readiness evaluator.
 */
export function buildFertilizerReadinessInput(
  enrichment: FertilizerEnrichmentResult,
): FertilizerProductProfileReadinessInput {
  const blockingSourceConflict = aggregateBlockingSourceConflict(enrichment.sourceConflicts)

  return {
    objectCategory: enrichment.objectCategory,
    identity: mapIdentity(enrichment.identity),
    productForm: enrichment.productForm.value,
    npk: {
      nitrogen: enrichment.npk.nitrogen,
      phosphate: enrichment.npk.phosphate,
      potash: enrichment.npk.potash,
      declarationBasis: enrichment.npk.declarationBasis,
    } as FertilizerReadinessNpk,
    nutrientMatrix: mapEnrichmentNutrientMatrixToReadiness(enrichment.nutrientMatrix),
    declarationEvaluation: {
      status: enrichment.declarationEvaluation.status,
    },
    blockingSourceConflict,
  }
}
