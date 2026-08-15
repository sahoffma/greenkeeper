import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'
import type { FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'
import type {
  ManufacturerStructuredResearchRecord,
  ManufacturerStructuredResearchSourceRecord,
} from './fertilizerManufacturerStructuredResearchCore'
import {
  evaluateStructuredResearchSourceIdentityEvidence,
  type StructuredResearchSourceIdentityEvidence,
} from './fertilizerManufacturerStructuredResearchSourceIdentityCore'
import {
  productLinesCompatible,
  resolveExpectedStructuredResearchNpk,
  npkTripletsCompatible,
} from './fertilizerManufacturerStructuredResearchIdentityCore'
import { parseNpkTripletFromText } from './fertilizerManufacturerStructuredResearchSourceIdentityCore'

const NPK_MATRIX_KEYS = new Set<FertilizerNutrientMatrixKey>(['nitrogen', 'phosphate', 'potash'])

export type StructuredResearchNutrientProvenanceRejectionReason =
  | 'none'
  | 'mixed_variant_sources'
  | 'nutrient_source_missing'
  | 'nutrient_source_unverified'
  | 'nutrient_source_identity_mismatch'

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
}

function sourceIdentitiesCompatible(
  left: ManufacturerStructuredResearchSourceRecord,
  right: ManufacturerStructuredResearchSourceRecord,
): boolean {
  const leftIdentity = left.sourceIdentity
  const rightIdentity = right.sourceIdentity

  if (!leftIdentity || !rightIdentity) {
    return true
  }

  if (
    leftIdentity.productLine &&
    rightIdentity.productLine &&
    !productLinesCompatible(leftIdentity.productLine, rightIdentity.productLine)
  ) {
    return false
  }

  const leftNpk = parseNpkTripletFromText(leftIdentity.npkLabel)
  const rightNpk = parseNpkTripletFromText(rightIdentity.npkLabel)
  if (leftNpk && rightNpk && !npkTripletsCompatible(leftNpk, rightNpk)) {
    return false
  }

  return true
}

function sourcesHaveMixedVariantIdentities(
  sources: ManufacturerStructuredResearchSourceRecord[],
): boolean {
  for (let index = 0; index < sources.length; index += 1) {
    for (let other = index + 1; other < sources.length; other += 1) {
      if (!sourceIdentitiesCompatible(sources[index]!, sources[other]!)) {
        return true
      }
    }
  }

  return false
}

function evaluateSourceIdentityEvidence(input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  source: ManufacturerStructuredResearchSourceRecord
  recordProductLineMatchesExpected: boolean
  recordNpkCompatible: boolean
}): StructuredResearchSourceIdentityEvidence {
  return evaluateStructuredResearchSourceIdentityEvidence({
    identity: input.identity,
    npkLabel: input.npkLabel,
    primarySource: input.source,
    recordProductLineMatchesExpected: input.recordProductLineMatchesExpected,
    recordNpkCompatible: input.recordNpkCompatible,
  })
}

function resolveNutrientSourceIndex(
  record: ManufacturerStructuredResearchRecord,
  key: FertilizerNutrientMatrixKey,
  primarySourceIndex: number,
  singleVerifiedSourceOnly: boolean,
): number | null {
  const explicitIndex = record.nutrientSourceIndices?.[key]
  if (typeof explicitIndex === 'number' && Number.isInteger(explicitIndex)) {
    return explicitIndex
  }

  if (singleVerifiedSourceOnly) {
    return primarySourceIndex
  }

  return null
}

export function validateStructuredResearchNutrientProvenance(input: {
  record: ManufacturerStructuredResearchRecord
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  primarySource: ManufacturerStructuredResearchSourceRecord | null
  primarySourceIndex: number
  recordProductLineMatchesExpected: boolean
  recordNpkCompatible: boolean
}): StructuredResearchNutrientProvenanceValidation {
  const sulfurValue = input.record.nutrientMatrix.sulfur
  const sulfurPresentInStructuredResult = typeof sulfurValue === 'number'
  const mixedVariantNutrientSourceDetected = sourcesHaveMixedVariantIdentities(input.record.sources)

  const base = {
    sulfurPresentInStructuredResult,
    sulfurSourcePresent: false,
    sulfurSourceIdentityVerified: false,
    sulfurSourceMatchesCanonicalDeclarationSource: false,
    nutrientSourceMismatchCount: 0,
    mixedVariantNutrientSourceDetected,
    acceptedNutrientKeys: [] as FertilizerNutrientMatrixKey[],
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

  if (!input.primarySource) {
    return reject('nutrient_source_unverified')
  }

  if (mixedVariantNutrientSourceDetected) {
    return reject('mixed_variant_sources')
  }

  const verifiedSourceIndices = new Set<number>()
  for (let index = 0; index < input.record.sources.length; index += 1) {
    const evidence = evaluateSourceIdentityEvidence({
      identity: input.identity,
      npkLabel: input.npkLabel,
      source: input.record.sources[index]!,
      recordProductLineMatchesExpected: input.recordProductLineMatchesExpected,
      recordNpkCompatible: input.recordNpkCompatible,
    })

    if (evidence.sourceBoundIdentityAccepted) {
      verifiedSourceIndices.add(index)
    }
  }

  if (verifiedSourceIndices.size === 0) {
    return reject('nutrient_source_unverified')
  }

  const singleVerifiedSourceOnly =
    verifiedSourceIndices.size === 1 && input.record.sources.length === 1
  const primarySourceIndex = input.primarySourceIndex
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

    const sourceIndex = resolveNutrientSourceIndex(
      input.record,
      key,
      primarySourceIndex,
      singleVerifiedSourceOnly,
    )

    if (sourceIndex == null || sourceIndex < 0 || sourceIndex >= input.record.sources.length) {
      nutrientSourceMismatchCount += 1
      continue
    }

    if (!verifiedSourceIndices.has(sourceIndex)) {
      nutrientSourceMismatchCount += 1
      continue
    }

    acceptedNutrientKeys.push(key)
  }

  const sulfurSourceIndex = resolveNutrientSourceIndex(
    input.record,
    'sulfur',
    primarySourceIndex,
    singleVerifiedSourceOnly,
  )
  const sulfurSourcePresent = sulfurSourceIndex != null
  const sulfurSourceIdentityVerified =
    sulfurSourceIndex != null && verifiedSourceIndices.has(sulfurSourceIndex)
  const sulfurSourceMatchesCanonicalDeclarationSource =
    sulfurSourceIdentityVerified && sulfurSourceIndex === primarySourceIndex

  const sulfurDiagnostics = {
    sulfurSourcePresent,
    sulfurSourceIdentityVerified,
    sulfurSourceMatchesCanonicalDeclarationSource,
  }

  if (nutrientSourceMismatchCount > 0) {
    return reject(
      input.record.sources.length > 1 ? 'nutrient_source_missing' : 'nutrient_source_unverified',
      {
        ...sulfurDiagnostics,
        nutrientSourceMismatchCount,
      },
    )
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
}): ReturnType<typeof resolveExpectedStructuredResearchNpk> {
  return resolveExpectedStructuredResearchNpk(input)
}
