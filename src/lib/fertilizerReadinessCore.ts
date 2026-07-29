import {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  FERTILIZER_READINESS_CONTRACT_ERROR_CODE,
  FERTILIZER_READINESS_SPECIFICATION_VERSION,
  type EvaluateFertilizerReadinessOptions,
  type FertilizerBlockingIssue,
  type FertilizerMissingRequirementKey,
  type FertilizerNutrientMatrix,
  type FertilizerNutrientValue,
  type FertilizerNpkDeclarationBasis,
  type FertilizerProductProfileReadinessInput,
  type FertilizerReadinessResult,
  type FertilizerReadinessStatus,
  type FertilizerSuggestedInputAction,
} from '../types/fertilizerReadiness'

export {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  FERTILIZER_READINESS_CONTRACT_ERROR_CODE,
  FERTILIZER_READINESS_SPECIFICATION_VERSION,
}

const ALL_REQUIREMENT_KEYS: FertilizerMissingRequirementKey[] = [
  'identity.manufacturer',
  'identity.official_name',
  'identity.variant',
  'identity.fingerprint',
  'identity.ambiguity',
  'basis.product_form',
  'basis.npk',
  'basis.npk.declaration_basis',
  'basis.npk.exception',
  'ingredients.declaration_source',
  'ingredients.matrix',
  'sources.conflict',
]

/**
 * Status priority (GM-009):
 * 1. Contract error — outside FertilizerReadinessResult (unsupported_object_category).
 * 2. Explicit unresolvable severe blockers → not_ready.
 * 3. Missing or user-solvable requirements → needs_input.
 * 4. All blocking requirements fulfilled → ready.
 */
export class FertilizerReadinessContractError extends Error {
  readonly code = FERTILIZER_READINESS_CONTRACT_ERROR_CODE

  readonly receivedObjectCategory: string

  constructor(receivedObjectCategory: string) {
    super(
      `Fertilizer readiness evaluator does not support object category "${receivedObjectCategory}".`,
    )
    this.name = 'FertilizerReadinessContractError'
    this.receivedObjectCategory = receivedObjectCategory
  }
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Valid nutrient value: finite number >= 0. Zero is valid; null/undefined/NaN are not. */
export function isValidNutrientNumericValue(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isValidNutrientValue(
  entry: FertilizerNutrientValue | null | undefined,
): entry is FertilizerNutrientValue {
  if (entry == null) {
    return false
  }

  return (
    isValidNutrientNumericValue(entry.value) &&
    entry.unit === '%' &&
    isNonEmptyString(entry.declarationBasis)
  )
}

function isValidNpkDeclarationBasis(
  basis: FertilizerNpkDeclarationBasis | null,
): basis is FertilizerNpkDeclarationBasis {
  return (
    basis != null &&
    basis.nitrogen === 'N' &&
    basis.phosphate === 'P2O5' &&
    basis.potash === 'K2O'
  )
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort() as T[]
}

function dedupeBlockingIssues(issues: FertilizerBlockingIssue[]): FertilizerBlockingIssue[] {
  const seen = new Set<FertilizerBlockingIssue['code']>()

  return issues.filter((issue) => {
    if (seen.has(issue.code)) {
      return false
    }

    seen.add(issue.code)
    return true
  })
}

function actionsForMissingRequirements(
  missing: FertilizerMissingRequirementKey[],
): FertilizerSuggestedInputAction[] {
  const actions = new Set<FertilizerSuggestedInputAction>()

  for (const key of missing) {
    switch (key) {
      case 'identity.manufacturer':
      case 'identity.official_name':
      case 'identity.fingerprint':
        actions.add('manual_fallback_input')
        break
      case 'identity.ambiguity':
        actions.add('confirm_product_variant')
        break
      case 'basis.product_form':
        actions.add('confirm_product_form')
        break
      case 'ingredients.declaration_source':
        actions.add('upload_back_photo')
        actions.add('upload_product_document')
        break
      case 'ingredients.matrix':
        actions.add('upload_back_photo')
        actions.add('upload_product_document')
        break
      case 'sources.conflict':
        actions.add('upload_product_document')
        actions.add('capture_additional_packaging_photo')
        break
      case 'basis.npk':
      case 'basis.npk.declaration_basis':
        actions.add('upload_back_photo')
        actions.add('manual_fallback_input')
        break
      default:
        break
    }
  }

  return uniqueSorted([...actions])
}

function evaluateMissingRequirements(
  input: FertilizerProductProfileReadinessInput,
): {
  notReadyMissing: FertilizerMissingRequirementKey[]
  needsInputMissing: FertilizerMissingRequirementKey[]
  blockingIssues: FertilizerBlockingIssue[]
} {
  const notReadyMissing: FertilizerMissingRequirementKey[] = []
  const needsInputMissing: FertilizerMissingRequirementKey[] = []
  const blockingIssues: FertilizerBlockingIssue[] = []

  if (input.identity.identityNotActionable) {
    notReadyMissing.push('identity.ambiguity')
    blockingIssues.push({ code: 'identity.not_actionable' })
  } else if (input.identity.identityAmbiguity.isAmbiguous) {
    if (input.identity.identityAmbiguityResolvable === false) {
      notReadyMissing.push('identity.ambiguity')
    } else {
      needsInputMissing.push('identity.ambiguity')
    }
  }

  if (!isNonEmptyString(input.identity.manufacturer)) {
    needsInputMissing.push('identity.manufacturer')
  }

  if (!isNonEmptyString(input.identity.officialName)) {
    needsInputMissing.push('identity.official_name')
  }

  if (!isNonEmptyString(input.identity.identityFingerprint)) {
    needsInputMissing.push('identity.fingerprint')
  }

  if (input.productForm !== 'granular' && input.productForm !== 'liquid') {
    needsInputMissing.push('basis.product_form')
  }

  const npkValues = [input.npk.nitrogen, input.npk.phosphate, input.npk.potash]
  const npkInvalid = npkValues.some((value) => !isValidNutrientNumericValue(value))

  if (npkInvalid) {
    needsInputMissing.push('basis.npk')
  }

  if (!isValidNpkDeclarationBasis(input.npk.declarationBasis)) {
    needsInputMissing.push('basis.npk.declaration_basis')
  }

  if (input.declarationEvaluation.status !== 'fully_evaluated') {
    needsInputMissing.push('ingredients.declaration_source')
  } else if (!isNutrientMatrixComplete(input.nutrientMatrix)) {
    needsInputMissing.push('ingredients.matrix')
  }

  const conflict = input.blockingSourceConflict

  if (conflict?.blocking) {
    if (conflict.resolvable) {
      needsInputMissing.push('sources.conflict')
    } else {
      notReadyMissing.push('sources.conflict')
      blockingIssues.push({ code: 'sources.conflict' })
    }
  }

  return {
    notReadyMissing: uniqueSorted(notReadyMissing),
    needsInputMissing: uniqueSorted(needsInputMissing),
    blockingIssues,
  }
}

/** Evaluator does not infer 0 — only validates delivered matrix state after full declaration evaluation. */
export function isNutrientMatrixComplete(matrix: FertilizerNutrientMatrix): boolean {
  return FERTILIZER_NUTRIENT_MATRIX_KEYS.every((key) => isValidNutrientValue(matrix[key]))
}

function resolveStatus(
  notReadyMissing: FertilizerMissingRequirementKey[],
  needsInputMissing: FertilizerMissingRequirementKey[],
): FertilizerReadinessStatus {
  if (notReadyMissing.length > 0) {
    return 'not_ready'
  }

  if (needsInputMissing.length > 0) {
    return 'needs_input'
  }

  return 'ready'
}

function buildFulfilledRequirements(
  missing: FertilizerMissingRequirementKey[],
): FertilizerMissingRequirementKey[] {
  const missingSet = new Set(missing)
  return ALL_REQUIREMENT_KEYS.filter((key) => !missingSet.has(key))
}

export function evaluateFertilizerReadiness(
  input: FertilizerProductProfileReadinessInput,
  options: EvaluateFertilizerReadinessOptions = {},
): FertilizerReadinessResult {
  if (input.objectCategory !== 'fertilizer') {
    throw new FertilizerReadinessContractError(String(input.objectCategory))
  }

  const { notReadyMissing, needsInputMissing, blockingIssues } = evaluateMissingRequirements(input)
  const status = resolveStatus(notReadyMissing, needsInputMissing)
  const missingRequirements =
    status === 'ready'
      ? []
      : status === 'not_ready'
        ? uniqueSorted([...notReadyMissing, ...needsInputMissing.filter((k) => !notReadyMissing.includes(k))])
        : needsInputMissing

  const dedupedMissing = uniqueSorted(missingRequirements)

  return {
    status,
    missingRequirements: dedupedMissing,
    fulfilledRequirements: buildFulfilledRequirements(dedupedMissing),
    blockingIssues: status === 'ready' ? [] : dedupeBlockingIssues(blockingIssues),
    suggestedInputActions:
      status === 'ready' ? [] : actionsForMissingRequirements(dedupedMissing),
    evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    specificationVersion: FERTILIZER_READINESS_SPECIFICATION_VERSION,
  }
}
