import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'
import type { RawFertilizerDeclarationInput } from '../types/fertilizerDeclarationNormalization'
import type { FertilizerEnrichmentNutrientMatrix } from '../types/fertilizerEnrichment'
import type { FertilizerSourceAdapterResult } from '../types/fertilizerEnrichmentOrchestration'
import type {
  FertilizerManufacturerNutrientChainDiagnostics,
  StructuredDeclarationCompletenessValidation,
  StructuredResearchIdentityValidationSummary,
  StructuredResearchNutrientProvenanceValidationSummary,
  ManufacturerStructuredResearchPhaseBDiagnostics,
} from '../types/fertilizerManufacturerResearchDiagnostics'
import type { StructuredResearchIdentityValidation } from './fertilizerManufacturerStructuredResearchIdentityCore'
import type { StructuredResearchNutrientProvenanceValidation } from './fertilizerManufacturerStructuredResearchNutrientProvenanceCore'

export type { FertilizerManufacturerNutrientChainDiagnostics, StructuredDeclarationCompletenessValidation }

export interface StructuredNutrientMatrixRecord {
  nutrientMatrix: Partial<
    Record<(typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number], number | null>
  >
}

export interface StructuredMatrixCounts {
  structuredMatrixEntryCount: number
  structuredPositiveEntryCount: number
  structuredZeroEntryCount: number
  structuredNullEntryCount: number
}

export interface NutrientPresenceSnapshot {
  nutrientKey: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number]
  presentInStructuredResult: boolean
  positiveInStructuredResult: boolean
  presentAfterAdapter: boolean
  presentAfterMerge: boolean
  presentAfterNormalization: boolean
}

function readAdapterExtractedNutrient(
  adapterResult: FertilizerSourceAdapterResult | null | undefined,
  nutrientKey: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number],
) {
  if (!adapterResult || (adapterResult.status !== 'success' && adapterResult.status !== 'partial')) {
    return null
  }

  return adapterResult.extraction?.extractedNutrients?.find((entry) => entry.key === nutrientKey) ?? null
}

export function countAdapterMatrixEntries(adapterResult: FertilizerSourceAdapterResult | null | undefined): {
  adapterMatrixEntryCount: number
  adapterPositiveEntryCount: number
} {
  if (!adapterResult || (adapterResult.status !== 'success' && adapterResult.status !== 'partial')) {
    return { adapterMatrixEntryCount: 0, adapterPositiveEntryCount: 0 }
  }

  let adapterMatrixEntryCount = 0
  let adapterPositiveEntryCount = 0

  for (const nutrient of adapterResult.extraction?.extractedNutrients ?? []) {
    if (nutrient.value == null) {
      continue
    }

    adapterMatrixEntryCount += 1
    if (nutrient.value > 0) {
      adapterPositiveEntryCount += 1
    }
  }

  return { adapterMatrixEntryCount, adapterPositiveEntryCount }
}

function countMergedMatrixEntries(raw: RawFertilizerDeclarationInput | null | undefined): {
  mergedMatrixEntryCountBeforeNormalization: number
  mergedPositiveEntryCountBeforeNormalization: number
} {
  if (!raw) {
    return {
      mergedMatrixEntryCountBeforeNormalization: 0,
      mergedPositiveEntryCountBeforeNormalization: 0,
    }
  }

  let mergedMatrixEntryCountBeforeNormalization = 0
  let mergedPositiveEntryCountBeforeNormalization = 0

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const entry = raw.nutrientMatrix[key]
    if (entry?.status !== 'declared' || entry.value == null) {
      continue
    }

    mergedMatrixEntryCountBeforeNormalization += 1
    if (entry.value > 0) {
      mergedPositiveEntryCountBeforeNormalization += 1
    }
  }

  return {
    mergedMatrixEntryCountBeforeNormalization,
    mergedPositiveEntryCountBeforeNormalization,
  }
}

function countNormalizedMatrixEntries(matrix: FertilizerEnrichmentNutrientMatrix | null | undefined): {
  normalizedMatrixEntryCount: number
  normalizedPositiveEntryCount: number
} {
  if (!matrix) {
    return { normalizedMatrixEntryCount: 0, normalizedPositiveEntryCount: 0 }
  }

  let normalizedMatrixEntryCount = 0
  let normalizedPositiveEntryCount = 0

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const entry = matrix[key]
    if (entry?.value == null) {
      continue
    }

    normalizedMatrixEntryCount += 1
    if (entry.value > 0) {
      normalizedPositiveEntryCount += 1
    }
  }

  return { normalizedMatrixEntryCount, normalizedPositiveEntryCount }
}

export function countStructuredMatrixEntries(
  record: StructuredNutrientMatrixRecord | null | undefined,
): StructuredMatrixCounts {
  if (!record) {
    return {
      structuredMatrixEntryCount: 0,
      structuredPositiveEntryCount: 0,
      structuredZeroEntryCount: 0,
      structuredNullEntryCount: 0,
    }
  }

  let structuredMatrixEntryCount = 0
  let structuredPositiveEntryCount = 0
  let structuredZeroEntryCount = 0
  let structuredNullEntryCount = 0

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const value = record.nutrientMatrix[key]
    if (value == null) {
      structuredNullEntryCount += 1
      continue
    }

    structuredMatrixEntryCount += 1
    if (value > 0) {
      structuredPositiveEntryCount += 1
    } else {
      structuredZeroEntryCount += 1
    }
  }

  return {
    structuredMatrixEntryCount,
    structuredPositiveEntryCount,
    structuredZeroEntryCount,
    structuredNullEntryCount,
  }
}

export function buildNutrientPresenceSnapshots(input: {
  structuredRecord?: StructuredNutrientMatrixRecord | null
  adapterResult?: FertilizerSourceAdapterResult | null
  rawDeclarationInput?: RawFertilizerDeclarationInput | null
  normalizedNutrientMatrix?: FertilizerEnrichmentNutrientMatrix | null
}): NutrientPresenceSnapshot[] {
  return FERTILIZER_NUTRIENT_MATRIX_KEYS.map((nutrientKey) => {
    const structuredValue = input.structuredRecord?.nutrientMatrix[nutrientKey]
    const adapterNutrient = readAdapterExtractedNutrient(input.adapterResult, nutrientKey)
    const mergedEntry = input.rawDeclarationInput?.nutrientMatrix[nutrientKey]
    const normalizedEntry = input.normalizedNutrientMatrix?.[nutrientKey]

    return {
      nutrientKey,
      presentInStructuredResult: typeof structuredValue === 'number',
      positiveInStructuredResult: typeof structuredValue === 'number' && structuredValue > 0,
      presentAfterAdapter: adapterNutrient?.value != null,
      presentAfterMerge:
        mergedEntry?.status === 'declared' && mergedEntry.value != null,
      presentAfterNormalization: normalizedEntry?.value != null,
    }
  })
}

export function summarizeStructuredResearchIdentityValidation(
  validation: StructuredResearchIdentityValidation | null | undefined,
): StructuredResearchIdentityValidationSummary | null {
  if (!validation) {
    return null
  }

  return {
    modelClaimedIdentityMatch: validation.modelClaimedIdentityMatch,
    identityMatchAccepted: validation.identityMatchAccepted,
    rejectionReason: validation.rejectionReason,
    expectedProductLinePresent: validation.expectedProductLinePresent,
    structuredProductLinePresent: validation.structuredProductLinePresent,
    structuredProductLineMatch: validation.structuredProductLineMatch,
    structuredNpkMatch: validation.structuredNpkMatch,
    canonicalDeclarationSourcePresent: validation.canonicalDeclarationSourcePresent,
    canonicalDeclarationSourceIdentityVerified: validation.canonicalDeclarationSourceIdentityVerified,
    canonicalDeclarationSourceProductLineVerified: validation.canonicalDeclarationSourceProductLineVerified,
    canonicalDeclarationSourceNpkVerified: validation.canonicalDeclarationSourceNpkVerified,
    declarationSourceIdentityMismatch: validation.declarationSourceIdentityMismatch,
    structuredIdentityEchoSuspected: validation.structuredIdentityEchoSuspected,
    sourceBoundIdentityAccepted: validation.sourceBoundIdentityAccepted,
  }
}

export function summarizeStructuredResearchNutrientProvenanceValidation(
  validation: StructuredResearchNutrientProvenanceValidation | null | undefined,
): StructuredResearchNutrientProvenanceValidationSummary | null {
  if (!validation) {
    return null
  }

  return {
    accepted: validation.accepted,
    rejectionReason: validation.rejectionReason,
    sulfurPresentInStructuredResult: validation.sulfurPresentInStructuredResult,
    sulfurSourcePresent: validation.sulfurSourcePresent,
    sulfurSourceIdentityVerified: validation.sulfurSourceIdentityVerified,
    sulfurSourceMatchesCanonicalDeclarationSource:
      validation.sulfurSourceMatchesCanonicalDeclarationSource,
    nutrientSourceMismatchCount: validation.nutrientSourceMismatchCount,
    mixedVariantNutrientSourceDetected: validation.mixedVariantNutrientSourceDetected,
    canonicalCandidateId: validation.canonicalCandidateId ?? null,
  }
}

export function buildManufacturerNutrientChainDiagnostics(input: {
  structuredRecord?: StructuredNutrientMatrixRecord | null
  adapterResult?: FertilizerSourceAdapterResult | null
  rawDeclarationInput?: RawFertilizerDeclarationInput | null
  normalizedNutrientMatrix?: FertilizerEnrichmentNutrientMatrix | null
  declarationCompletenessValidation?: StructuredDeclarationCompletenessValidation | null
  identityValidation?: StructuredResearchIdentityValidation | null
  nutrientProvenanceValidation?: StructuredResearchNutrientProvenanceValidation | null
  phaseB?: ManufacturerStructuredResearchPhaseBDiagnostics | null
}): FertilizerManufacturerNutrientChainDiagnostics {
  const structuredCounts = countStructuredMatrixEntries(input.structuredRecord)
  const adapterCounts = countAdapterMatrixEntries(input.adapterResult)
  const mergedCounts = countMergedMatrixEntries(input.rawDeclarationInput)
  const normalizedCounts = countNormalizedMatrixEntries(input.normalizedNutrientMatrix)

  return {
    ...structuredCounts,
    ...adapterCounts,
    mergedMatrixEntryCount: mergedCounts.mergedMatrixEntryCountBeforeNormalization,
    mergedPositiveEntryCount: mergedCounts.mergedPositiveEntryCountBeforeNormalization,
    ...normalizedCounts,
    declarationCompletenessValidation: input.declarationCompletenessValidation ?? null,
    structuredIdentityValidation: summarizeStructuredResearchIdentityValidation(input.identityValidation),
    structuredNutrientProvenanceValidation: summarizeStructuredResearchNutrientProvenanceValidation(
      input.nutrientProvenanceValidation,
    ),
    nutrientPresence: buildNutrientPresenceSnapshots(input),
    phaseB: input.phaseB ?? null,
  }
}
