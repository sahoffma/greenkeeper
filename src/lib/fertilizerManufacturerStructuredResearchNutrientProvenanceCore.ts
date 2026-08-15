import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'
import type { FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'
import type {
  ManufacturerStructuredResearchRecord,
  ManufacturerStructuredResearchSourceRecord,
} from './fertilizerManufacturerStructuredResearchCore'
import {
  buildManufacturerSearchNutrientBindings,
  buildManufacturerSearchResearchDecision,
  type ManufacturerSearchCandidateSelection,
  type ManufacturerSearchNutrientBinding,
  resolveModelSourceUrlForCandidate,
} from './fertilizerManufacturerSearchCandidateCore'
import { resolveExpectedStructuredResearchNpk } from './fertilizerManufacturerStructuredResearchIdentityCore'

const NPK_MATRIX_KEYS = new Set<FertilizerNutrientMatrixKey>(['nitrogen', 'phosphate', 'potash'])

export type StructuredResearchNutrientProvenanceRejectionReason =
  | 'none'
  | 'mixed_variant_sources'
  | 'nutrient_source_missing'
  | 'nutrient_source_unverified'
  | 'nutrient_source_identity_mismatch'
  | 'candidate_ambiguity'
  | 'no_canonical_candidate'

export interface StructuredResearchNutrientProvenanceValidation {
  accepted: boolean
  rejectionReason: StructuredResearchNutrientProvenanceRejectionReason
  sulfurPresentInStructuredResult: boolean
  sulfurSourcePresent: boolean
  sulfurSourceIdentityVerified: boolean
  sulfurSourceMatchesCanonicalDeclarationSource: boolean
  nutrientSourceMismatchCount: number
  mixedVariantNutrientSourceDetected: boolean
  acceptedNutrientKeys: FertilizerNutrientMatrixKey[]
  nutrientSourceBindings: ManufacturerSearchNutrientBinding[]
  canonicalCandidateId: string | null
}

function resolveNutrientSourceUrl(input: {
  record: ManufacturerStructuredResearchRecord
  key: FertilizerNutrientMatrixKey
  canonicalSourceIndex: number
}): string | null {
  const explicitIndex = input.record.nutrientSourceIndices?.[input.key]
  const sourceIndex =
    typeof explicitIndex === 'number' && Number.isInteger(explicitIndex)
      ? explicitIndex
      : input.canonicalSourceIndex

  if (sourceIndex == null || sourceIndex < 0 || sourceIndex >= input.record.sources.length) {
    return null
  }

  return input.record.sources[sourceIndex]?.url ?? null
}

function detectCrossVariantNutrientBinding(input: {
  record: ManufacturerStructuredResearchRecord
  selection: ManufacturerSearchCandidateSelection
  canonicalSourceIndex: number
}): boolean {
  const canonicalId = input.selection.canonicalCandidate?.candidateId ?? null
  if (!canonicalId) {
    return false
  }

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    if (typeof input.record.nutrientMatrix[key] !== 'number') {
      continue
    }

    const sourceUrl = resolveNutrientSourceUrl({
      record: input.record,
      key,
      canonicalSourceIndex: input.canonicalSourceIndex,
    })
    if (!sourceUrl) {
      continue
    }

    const boundCandidateId = resolveModelSourceUrlForCandidate({
      url: sourceUrl,
      candidates: input.selection.candidates,
    })
    if (boundCandidateId && boundCandidateId !== canonicalId) {
      return true
    }
  }

  return false
}

export function validateStructuredResearchNutrientProvenance(input: {
  record: ManufacturerStructuredResearchRecord
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  primarySource: ManufacturerStructuredResearchSourceRecord | null
  primarySourceIndex: number
  recordProductLineMatchesExpected: boolean
  recordNpkCompatible: boolean
  selection: ManufacturerSearchCandidateSelection
}): StructuredResearchNutrientProvenanceValidation {
  const sulfurValue = input.record.nutrientMatrix.sulfur
  const sulfurPresentInStructuredResult = typeof sulfurValue === 'number'
  const nutrientSourceBindings = buildManufacturerSearchNutrientBindings({
    record: input.record,
    selection: input.selection,
  })
  const researchDecision = buildManufacturerSearchResearchDecision({
    selection: input.selection,
    nutrientBindings: nutrientSourceBindings,
    candidateAmbiguityOverride: input.identity.hasIdentityAmbiguity
      ? false
      : undefined,
  })
  const mixedVariantNutrientSourceDetected = detectCrossVariantNutrientBinding({
    record: input.record,
    selection: input.selection,
    canonicalSourceIndex: input.primarySourceIndex,
  })

  const base = {
    sulfurPresentInStructuredResult,
    sulfurSourcePresent: false,
    sulfurSourceIdentityVerified: false,
    sulfurSourceMatchesCanonicalDeclarationSource: false,
    nutrientSourceMismatchCount: 0,
    mixedVariantNutrientSourceDetected,
    acceptedNutrientKeys: [] as FertilizerNutrientMatrixKey[],
    nutrientSourceBindings,
    canonicalCandidateId: input.selection.canonicalCandidate?.candidateId ?? null,
  }

  const reject = (
    rejectionReason: StructuredResearchNutrientProvenanceRejectionReason,
    partial: Partial<StructuredResearchNutrientProvenanceValidation> = {},
  ): StructuredResearchNutrientProvenanceValidation => ({
    ...base,
    ...partial,
    accepted: false,
    rejectionReason,
  })

  if (researchDecision.reason === 'candidate_ambiguity') {
    return reject('candidate_ambiguity')
  }

  if (!input.selection.canonicalCandidate || !input.primarySource) {
    return reject('no_canonical_candidate')
  }

  if (mixedVariantNutrientSourceDetected) {
    return reject('mixed_variant_sources')
  }

  if (!researchDecision.accepted) {
    const sulfurBinding = nutrientSourceBindings.find((binding) => binding.nutrientKey === 'sulfur')
    return reject(
      researchDecision.reason === 'nutrient_not_bound_to_canonical_candidate'
        ? 'nutrient_source_identity_mismatch'
        : 'nutrient_source_unverified',
      {
        nutrientSourceMismatchCount: nutrientSourceBindings.filter((binding) => !binding.accepted).length,
        sulfurSourcePresent: sulfurBinding?.candidateId != null,
        sulfurSourceIdentityVerified: sulfurBinding?.accepted === true,
        sulfurSourceMatchesCanonicalDeclarationSource: sulfurBinding?.accepted === true,
      },
    )
  }

  const acceptedNutrientKeys: FertilizerNutrientMatrixKey[] = []
  let nutrientSourceMismatchCount = 0

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const value = input.record.nutrientMatrix[key]
    if (typeof value !== 'number') {
      continue
    }

    if (NPK_MATRIX_KEYS.has(key) && input.record.npk != null) {
      acceptedNutrientKeys.push(key)
      continue
    }

    const binding = nutrientSourceBindings.find((entry) => entry.nutrientKey === key)
    if (!binding?.accepted) {
      nutrientSourceMismatchCount += 1
      continue
    }

    acceptedNutrientKeys.push(key)
  }

  const sulfurBinding = nutrientSourceBindings.find((binding) => binding.nutrientKey === 'sulfur')
  const sulfurDiagnostics = {
    sulfurSourcePresent: sulfurBinding?.candidateId != null,
    sulfurSourceIdentityVerified: sulfurBinding?.accepted === true,
    sulfurSourceMatchesCanonicalDeclarationSource: sulfurBinding?.accepted === true,
  }

  if (nutrientSourceMismatchCount > 0) {
    return reject('nutrient_source_missing', {
      ...sulfurDiagnostics,
      nutrientSourceMismatchCount,
    })
  }

  return {
    ...base,
    ...sulfurDiagnostics,
    nutrientSourceMismatchCount: 0,
    accepted: true,
    rejectionReason: 'none',
    acceptedNutrientKeys,
  }
}

export function filterStructuredResearchRecordNutrientsByProvenance(input: {
  record: ManufacturerStructuredResearchRecord
  acceptedNutrientKeys: readonly FertilizerNutrientMatrixKey[]
}): ManufacturerStructuredResearchRecord {
  const accepted = new Set(input.acceptedNutrientKeys)
  const nutrientMatrix = { ...input.record.nutrientMatrix }
  const nutrientDeclarationBases = { ...input.record.nutrientDeclarationBases }

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    if (NPK_MATRIX_KEYS.has(key)) {
      continue
    }

    if (!accepted.has(key)) {
      nutrientMatrix[key] = null
      nutrientDeclarationBases[key] = null
    }
  }

  return {
    ...input.record,
    nutrientMatrix,
    nutrientDeclarationBases,
  }
}

export function resolveExpectedStructuredResearchNpkForProvenance(input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
}) {
  return resolveExpectedStructuredResearchNpk(input)
}
