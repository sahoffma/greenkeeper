import { FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION } from '../types/fertilizerEnrichment'
import type {
  FertilizerEnrichmentConflictStatus,
  FertilizerEnrichmentNormalization,
  FertilizerEnrichmentNutrientEntry,
  FertilizerEnrichmentNutrientMatrix,
} from '../types/fertilizerEnrichment'
import {
  FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  type FertilizerDeclarationConflict,
  type FertilizerDeclarationNormalizationResult,
  type FertilizerFieldProvenance,
  type NormalizedFertilizerEnrichmentResult,
  type RawFertilizerDeclarationCoverageMetadata,
  type RawFertilizerDeclarationInput,
  type RawFertilizerDeclarationValue,
} from '../types/fertilizerDeclarationNormalization'
import type {
  DeclarationEvaluationStatus,
  FertilizerNutrientMatrixKey,
} from '../types/fertilizerReadiness'
import { isValidNutrientNumericValue } from './fertilizerNutrientValueCore'

export const FERTILIZER_DECLARATION_NORMALIZATION_CONTRACT_ERROR_CODE =
  'unsupported_object_category' as const

export type FertilizerDeclarationNormalizationContractErrorCode =
  typeof FERTILIZER_DECLARATION_NORMALIZATION_CONTRACT_ERROR_CODE

export class FertilizerDeclarationNormalizationContractError extends Error {
  readonly code = FERTILIZER_DECLARATION_NORMALIZATION_CONTRACT_ERROR_CODE

  readonly receivedObjectCategory: string

  constructor(receivedObjectCategory: string) {
    super(
      `Fertilizer declaration normalizer does not support object category "${receivedObjectCategory}".`,
    )
    this.name = 'FertilizerDeclarationNormalizationContractError'
    this.receivedObjectCategory = receivedObjectCategory
  }
}

export interface NormalizeFertilizerDeclarationOptions {
  normalizedAt?: string
  normalizationRunId?: string
}

interface NormalizedScalarOutcome {
  value: number | null | undefined
  normalization: FertilizerEnrichmentNormalization
  declarationBasis: string | null
  provenanceId: string | null
  isResolved: boolean
}

function isFullyEvaluatedCoverage(coverage: RawFertilizerDeclarationCoverageMetadata): boolean {
  return (
    coverage.sourceEvaluationStatus === 'source_fully_evaluated' &&
    coverage.evaluatedSourceIds.length > 0 &&
    coverage.productScopeConfirmed === true &&
    coverage.variantMatched === true &&
    coverage.nutrientSectionLocated === true &&
    coverage.nutrientSectionFullyCaptured === true &&
    coverage.declarationBasisResolved === true &&
    coverage.hasBlockingDeclarationConflict === false
  )
}

export function deriveDeclarationEvaluationStatus(
  coverage: RawFertilizerDeclarationCoverageMetadata,
): DeclarationEvaluationStatus {
  if (isFullyEvaluatedCoverage(coverage)) {
    return 'fully_evaluated'
  }

  if (coverage.sourceEvaluationStatus === 'not_started') {
    return 'not_started'
  }

  return 'insufficient_sources'
}

function defaultDeclarationBasisForMatrixKey(key: FertilizerNutrientMatrixKey): string {
  switch (key) {
    case 'phosphate':
      return 'P2O5'
    case 'potash':
      return 'K2O'
    case 'magnesium':
      return 'MgO'
    case 'calcium':
      return 'CaO'
    case 'sulfur':
      return 'SO3'
    case 'iron':
      return 'Fe'
    case 'manganese':
      return 'Mn'
    case 'copper':
      return 'Cu'
    case 'zinc':
      return 'Zn'
    case 'boron':
      return 'B'
    case 'molybdenum':
      return 'Mo'
    default:
      return 'N'
  }
}

function pickDeterministicProvenanceId(
  provenanceIds: string[] | undefined,
  evaluatedSourceIds: string[],
  provenanceRecords: Record<string, FertilizerFieldProvenance>,
): string | null {
  const candidates: string[] = []

  if (provenanceIds) {
    for (const id of provenanceIds) {
      if (provenanceRecords[id]) {
        candidates.push(id)
      }
    }
  }

  for (const id of evaluatedSourceIds) {
    if (provenanceRecords[id] && !candidates.includes(id)) {
      candidates.push(id)
    }
  }

  if (candidates.length === 0) {
    return null
  }

  const primary = candidates.find((id) => provenanceRecords[id]?.isPrimary === true)
  return primary ?? candidates[0]
}

function conflictStatusForField(
  fieldPath: string,
  conflicts: FertilizerDeclarationConflict[],
): FertilizerEnrichmentConflictStatus {
  const fieldConflicts = conflicts.filter((conflict) => conflict.fieldPath === fieldPath)

  if (fieldConflicts.length === 0) {
    return 'none'
  }

  const blockingConflicts = fieldConflicts.filter((conflict) => conflict.blocking)

  if (blockingConflicts.length === 0) {
    return 'non_blocking'
  }

  if (blockingConflicts.some((conflict) => !conflict.resolvable)) {
    return 'blocking_unresolvable'
  }

  return 'blocking_resolvable'
}

function normalizeRawScalarValue(
  raw: RawFertilizerDeclarationValue | null | undefined,
  fallbackBasis: string | null,
  fullyEvaluated: boolean,
  evaluatedSourceIds: string[],
  provenanceRecords: Record<string, FertilizerFieldProvenance>,
): NormalizedScalarOutcome {
  if (raw == null) {
    return {
      value: undefined,
      normalization: 'unresolved',
      declarationBasis: null,
      provenanceId: null,
      isResolved: false,
    }
  }

  switch (raw.status) {
    case 'declared': {
      const numericValue = raw.value
      if (!isValidNutrientNumericValue(numericValue)) {
        return {
          value: null,
          normalization: 'unresolved',
          declarationBasis: raw.declarationBasis ?? fallbackBasis,
          provenanceId: pickDeterministicProvenanceId(
            raw.provenanceIds,
            evaluatedSourceIds,
            provenanceRecords,
          ),
          isResolved: false,
        }
      }

      return {
        value: numericValue,
        normalization: 'declared',
        declarationBasis: raw.declarationBasis ?? fallbackBasis,
        provenanceId: pickDeterministicProvenanceId(
          raw.provenanceIds,
          evaluatedSourceIds,
          provenanceRecords,
        ),
        isResolved: true,
      }
    }
    case 'not_declared': {
      if (!fullyEvaluated) {
        return {
          value: null,
          normalization: 'unresolved',
          declarationBasis: null,
          provenanceId: null,
          isResolved: false,
        }
      }

      const provenanceId = pickDeterministicProvenanceId(
        raw.provenanceIds,
        evaluatedSourceIds,
        provenanceRecords,
      )

      if (provenanceId == null) {
        return {
          value: null,
          normalization: 'unresolved',
          declarationBasis: null,
          provenanceId: null,
          isResolved: false,
        }
      }

      return {
        value: 0,
        normalization: 'dl014_zero',
        declarationBasis: raw.declarationBasis ?? fallbackBasis,
        provenanceId,
        isResolved: true,
      }
    }
    case 'not_extracted':
    case 'unreadable':
    case 'basis_unknown':
    case 'conflicting':
      return {
        value: null,
        normalization: 'unresolved',
        declarationBasis: raw.declarationBasis ?? null,
        provenanceId: pickDeterministicProvenanceId(
          raw.provenanceIds,
          evaluatedSourceIds,
          provenanceRecords,
        ),
        isResolved: false,
      }
    default: {
      const _exhaustive: never = raw.status
      return _exhaustive
    }
  }
}

function buildProvenanceSnapshot(
  provenanceId: string | null,
  provenanceRecords: Record<string, FertilizerFieldProvenance>,
): Pick<
  FertilizerEnrichmentNutrientEntry,
  'evidence' | 'sourceUrl' | 'sourceCategory' | 'confidence'
> {
  if (provenanceId == null || provenanceRecords[provenanceId] == null) {
    return {
      evidence: null,
      sourceUrl: null,
      sourceCategory: null,
      confidence: null,
    }
  }

  const record = provenanceRecords[provenanceId]
  return {
    evidence: record.evidence,
    sourceUrl: record.sourceUrl,
    sourceCategory: record.sourceCategory,
    confidence: record.confidence,
  }
}

function normalizeNutrientMatrix(
  input: RawFertilizerDeclarationInput,
  fullyEvaluated: boolean,
  conflicts: FertilizerDeclarationConflict[],
): {
  matrix: FertilizerEnrichmentNutrientMatrix
  hasResolvedValue: boolean
  hasUnresolvedValue: boolean
  allResolvedWithValidNumeric: boolean
} {
  const matrix = {} as FertilizerEnrichmentNutrientMatrix
  let hasResolvedValue = false
  let hasUnresolvedValue = false
  let allResolvedWithValidNumeric = true

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const fieldPath = `nutrientMatrix.${key}`
    const fallbackBasis = defaultDeclarationBasisForMatrixKey(key)
    const outcome = normalizeRawScalarValue(
      input.nutrientMatrix[key],
      fallbackBasis,
      fullyEvaluated,
      input.coverageMetadata.evaluatedSourceIds,
      input.provenanceRecords,
    )

    if (outcome.isResolved) {
      hasResolvedValue = true
    } else {
      hasUnresolvedValue = true
      allResolvedWithValidNumeric = false
    }

    if (
      !outcome.isResolved ||
      !isValidNutrientNumericValue(outcome.value) ||
      outcome.declarationBasis == null ||
      outcome.declarationBasis.length === 0
    ) {
      allResolvedWithValidNumeric = false
    }

    const provenanceSnapshot = buildProvenanceSnapshot(outcome.provenanceId, input.provenanceRecords)

    matrix[key] = {
      value: outcome.value ?? null,
      declarationBasis: outcome.declarationBasis,
      unit: '%',
      normalization: outcome.normalization,
      provenanceId: outcome.provenanceId,
      ...provenanceSnapshot,
      conflictStatus: conflictStatusForField(fieldPath, conflicts),
    }
  }

  return {
    matrix,
    hasResolvedValue,
    hasUnresolvedValue,
    allResolvedWithValidNumeric,
  }
}

function normalizeNpk(
  input: RawFertilizerDeclarationInput,
  fullyEvaluated: boolean,
): {
  nitrogen: number | null | undefined
  phosphate: number | null | undefined
  potash: number | null | undefined
  hasResolvedValue: boolean
  hasUnresolvedValue: boolean
  allResolvedWithValidNumeric: boolean
} {
  const { evaluatedSourceIds } = input.coverageMetadata
  const { provenanceRecords, npk } = input

  const nitrogenOutcome = normalizeRawScalarValue(
    npk.nitrogen,
    'N',
    fullyEvaluated,
    evaluatedSourceIds,
    provenanceRecords,
  )
  const phosphateOutcome = normalizeRawScalarValue(
    npk.phosphate,
    'P2O5',
    fullyEvaluated,
    evaluatedSourceIds,
    provenanceRecords,
  )
  const potashOutcome = normalizeRawScalarValue(
    npk.potash,
    'K2O',
    fullyEvaluated,
    evaluatedSourceIds,
    provenanceRecords,
  )

  const outcomes = [nitrogenOutcome, phosphateOutcome, potashOutcome]
  const hasResolvedValue = outcomes.some((outcome) => outcome.isResolved)
  const hasUnresolvedValue = outcomes.some((outcome) => !outcome.isResolved)
  const allResolvedWithValidNumeric = outcomes.every(
    (outcome) =>
      outcome.isResolved &&
      isValidNutrientNumericValue(outcome.value) &&
      outcome.declarationBasis != null &&
      outcome.declarationBasis.length > 0,
  )

  return {
    nitrogen: nitrogenOutcome.value ?? null,
    phosphate: phosphateOutcome.value ?? null,
    potash: potashOutcome.value ?? null,
    hasResolvedValue,
    hasUnresolvedValue,
    allResolvedWithValidNumeric,
  }
}

function cloneProvenanceRecords(
  provenanceRecords: Record<string, FertilizerFieldProvenance>,
  matrix: FertilizerEnrichmentNutrientMatrix,
): Record<string, FertilizerFieldProvenance> {
  const cloned: Record<string, FertilizerFieldProvenance> = {}

  for (const [id, record] of Object.entries(provenanceRecords)) {
    cloned[id] = { ...record }
  }

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const entry = matrix[key]
    if (entry?.provenanceId && cloned[entry.provenanceId]) {
      cloned[entry.provenanceId] = {
        ...cloned[entry.provenanceId],
        fieldPath: `nutrientMatrix.${key}`,
        normalization: entry.normalization,
      }
    }
  }

  return cloned
}

function deriveNormalizationStatus(params: {
  fullyEvaluated: boolean
  matrixAllResolved: boolean
  npkAllResolved: boolean
  hasUnresolvedValue: boolean
  conflicts: FertilizerDeclarationConflict[]
  identityNotActionable: boolean
  variantMatched: boolean
  npkDeclarationBasisPresent: boolean
}): NormalizedFertilizerEnrichmentResult['normalizationStatus'] {
  const {
    fullyEvaluated,
    matrixAllResolved,
    npkAllResolved,
    hasUnresolvedValue,
    conflicts,
    identityNotActionable,
    variantMatched,
    npkDeclarationBasisPresent,
  } = params

  const hasBlockingUnresolvableConflict = conflicts.some(
    (conflict) => conflict.blocking && !conflict.resolvable,
  )

  if (identityNotActionable || hasBlockingUnresolvableConflict) {
    return 'blocked'
  }

  if (
    !variantMatched &&
    conflicts.some((conflict) => conflict.type === 'variant_conflict' && conflict.blocking)
  ) {
    return 'blocked'
  }

  const hasBlockingUnresolvedConflict = conflicts.some(
    (conflict) =>
      conflict.blocking &&
      (conflict.resolutionStatus === 'unresolved' ||
        conflict.resolutionStatus === 'requires_user_input' ||
        conflict.resolutionStatus === 'not_resolvable'),
  )

  if (
    fullyEvaluated &&
    matrixAllResolved &&
    npkAllResolved &&
    npkDeclarationBasisPresent &&
    !hasUnresolvedValue &&
    !hasBlockingUnresolvedConflict
  ) {
    return 'normalized'
  }

  return 'partially_normalized'
}

/**
 * Pure DL-014 declaration normalizer — no external calls, no readiness, no persistence.
 */
export function normalizeFertilizerDeclaration(
  input: RawFertilizerDeclarationInput,
  options: NormalizeFertilizerDeclarationOptions = {},
): FertilizerDeclarationNormalizationResult {
  if (input.objectCategory !== 'fertilizer') {
    throw new FertilizerDeclarationNormalizationContractError(String(input.objectCategory))
  }

  const normalizedAt = options.normalizedAt ?? '1970-01-01T00:00:00.000Z'
  const normalizationRunId = options.normalizationRunId ?? 'normalization-run-default'
  const fullyEvaluated = isFullyEvaluatedCoverage(input.coverageMetadata)
  const declarationStatus = deriveDeclarationEvaluationStatus(input.coverageMetadata)
  const conflicts = input.sourceConflicts.map((conflict) => ({ ...conflict }))

  const matrixResult = normalizeNutrientMatrix(input, fullyEvaluated, conflicts)
  const npkResult = normalizeNpk(input, fullyEvaluated)
  const npkDeclarationBasisPresent = input.npk.declarationBasis != null

  const normalizationStatus = deriveNormalizationStatus({
    fullyEvaluated,
    matrixAllResolved: matrixResult.allResolvedWithValidNumeric,
    npkAllResolved: npkResult.allResolvedWithValidNumeric,
    hasUnresolvedValue: matrixResult.hasUnresolvedValue || npkResult.hasUnresolvedValue,
    conflicts,
    identityNotActionable: input.identity.identityNotActionable === true,
    variantMatched: input.coverageMetadata.variantMatched,
    npkDeclarationBasisPresent,
  })

  const provenanceRecords = cloneProvenanceRecords(input.provenanceRecords, matrixResult.matrix)

  const enrichmentResult: NormalizedFertilizerEnrichmentResult = {
    objectCategory: 'fertilizer',
    specificationVersion: FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
    identity: {
      manufacturer: input.identity.manufacturer,
      officialName: input.identity.officialName,
      productLine: input.identity.productLine,
      variant: input.identity.variant,
      identityFingerprint: input.identity.identityFingerprint,
      identityConfidence: input.identity.identityConfidence,
      hasIdentityAmbiguity: input.identity.hasIdentityAmbiguity,
      identityAmbiguityResolvable: input.identity.identityAmbiguityResolvable,
      identityNotActionable: input.identity.identityNotActionable,
    },
    productForm: {
      value: input.productForm.value,
      provenanceId: input.productForm.provenanceIds?.[0] ?? null,
    },
    npk: {
      nitrogen: npkResult.nitrogen,
      phosphate: npkResult.phosphate,
      potash: npkResult.potash,
      declarationBasis: input.npk.declarationBasis ?? null,
    },
    nutrientMatrix: matrixResult.matrix,
    declarationEvaluation: {
      status: declarationStatus,
      evaluatedSourceIds: [...input.coverageMetadata.evaluatedSourceIds],
      variantResolved: input.coverageMetadata.variantMatched,
      productScopeConfirmed: input.coverageMetadata.productScopeConfirmed,
      evaluatedAt: input.extractedAt ?? null,
    },
    sourceConflicts: conflicts,
    enrichmentRunId: input.enrichmentRunId ?? normalizationRunId,
    enrichedAt: input.extractedAt ?? normalizedAt,
    normalizationRunId,
    normalizedAt,
    normalizationStatus,
    normalizationRulesVersion: FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
    provenanceRecords,
  }

  return {
    status: normalizationStatus,
    enrichmentResult,
    normalizationSpecificationVersion: FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
    normalizedAt,
    normalizationRunId,
  }
}
