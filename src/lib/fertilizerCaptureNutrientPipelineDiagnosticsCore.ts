import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'
import type { RawFertilizerDeclarationInput } from '../types/fertilizerDeclarationNormalization'
import type { FertilizerEnrichmentNutrientMatrix } from '../types/fertilizerEnrichment'
import type { FertilizerSourceAdapterResult } from '../types/fertilizerEnrichmentOrchestration'
import type { ProductRecognizeImageAnalysis } from '../types/productRecognize'
import { parseFertilizerDeclarationText } from './fertilizerDeclarationTextParserCore'

import type {
  FertilizerCaptureNutrientPipelineDiagnostics,
  FertilizerNutrientLossStage,
} from '../types/fertilizerCaptureNutrientPipelineDiagnostics'

export type { FertilizerCaptureNutrientPipelineDiagnostics, FertilizerNutrientLossStage }

const NPK_VISION_KEYS = ['nitrogen', 'phosphate', 'potash'] as const

function countPositiveMatrixValues(
  matrix: FertilizerEnrichmentNutrientMatrix | null | undefined,
): number {
  if (!matrix) {
    return 0
  }

  return FERTILIZER_NUTRIENT_MATRIX_KEYS.filter((key) => {
    const value = matrix[key]?.value
    return typeof value === 'number' && value > 0
  }).length
}

function countZeroFilledMatrixValues(matrix: FertilizerEnrichmentNutrientMatrix | null | undefined): number {
  if (!matrix) {
    return 0
  }

  return FERTILIZER_NUTRIENT_MATRIX_KEYS.filter(
    (key) => matrix[key]?.normalization === 'dl014_zero',
  ).length
}

function countDeclaredPositiveRawValues(raw: RawFertilizerDeclarationInput): number {
  return FERTILIZER_NUTRIENT_MATRIX_KEYS.filter((key) => {
    const entry = raw.nutrientMatrix[key]
    return entry?.status === 'declared' && entry.value != null && entry.value > 0
  }).length
}

function countAdapterExtractedNutrients(adapterResults: FertilizerSourceAdapterResult[]): number {
  let count = 0

  for (const result of adapterResults) {
    if (result.status !== 'success' && result.status !== 'partial') {
      continue
    }

    for (const nutrient of result.extraction?.extractedNutrients ?? []) {
      if (nutrient.value != null && nutrient.value > 0) {
        count += 1
      }
    }
  }

  return count
}

function countVisionStructuredNutrients(
  analysis: Pick<
    ProductRecognizeImageAnalysis,
    'nitrogen' | 'phosphate' | 'potash'
  > | null | undefined,
): { entryCount: number; positiveCount: number } {
  if (!analysis) {
    return { entryCount: 0, positiveCount: 0 }
  }

  let entryCount = 0
  let positiveCount = 0

  for (const key of NPK_VISION_KEYS) {
    const value = analysis[key]
    if (value == null) {
      continue
    }

    entryCount += 1
    if (value > 0) {
      positiveCount += 1
    }
  }

  return { entryCount, positiveCount }
}

function resolveNutrientLossStage(input: {
  visionPositiveNutrientCount: number
  packagingTextNutrientCandidateCount: number
  packagingAdapterNutrientCount: number
  mergedPositiveNutrientCountBeforeZeroFill: number
  positiveNutrientCountAfterZeroFill: number
  positiveNutrientLostDuringMerge: number
  positiveNutrientLostDuringZeroFill: number
}): FertilizerNutrientLossStage {
  if (
    input.positiveNutrientCountAfterZeroFill > 0 &&
    input.positiveNutrientLostDuringMerge === 0 &&
    input.positiveNutrientLostDuringZeroFill === 0
  ) {
    return 'none'
  }

  if (
    input.packagingTextNutrientCandidateCount > 0 &&
    input.packagingAdapterNutrientCount === 0
  ) {
    return 'packaging_parser'
  }

  if (
    input.packagingAdapterNutrientCount > 0 &&
    input.mergedPositiveNutrientCountBeforeZeroFill < input.packagingAdapterNutrientCount
  ) {
    return 'adapter_merge'
  }

  if (input.positiveNutrientLostDuringZeroFill > 0) {
    return 'zero_fill'
  }

  if (input.positiveNutrientLostDuringMerge > 0) {
    return 'adapter_merge'
  }

  if (
    input.visionPositiveNutrientCount === 0 &&
    input.packagingTextNutrientCandidateCount === 0
  ) {
    return 'vision_missing'
  }

  if (
    input.packagingTextNutrientCandidateCount === 0 &&
    input.packagingAdapterNutrientCount === 0
  ) {
    return 'packaging_parser'
  }

  return 'unknown'
}

export function buildFertilizerCaptureNutrientPipelineDiagnostics(input: {
  visionAnalysis?: Pick<
    ProductRecognizeImageAnalysis,
    'nitrogen' | 'phosphate' | 'potash'
  > | null
  packagingDeclarationText?: string | null
  adapterResults?: FertilizerSourceAdapterResult[]
  rawDeclarationInput?: RawFertilizerDeclarationInput | null
  normalizedNutrientMatrix?: FertilizerEnrichmentNutrientMatrix | null
}): FertilizerCaptureNutrientPipelineDiagnostics {
  const visionCounts = countVisionStructuredNutrients(input.visionAnalysis)
  const packagingTextNutrientCandidateCount = input.packagingDeclarationText
    ? parseFertilizerDeclarationText(input.packagingDeclarationText).nutrients.filter(
        (nutrient) => nutrient.value > 0,
      ).length
    : 0
  const packagingAdapterNutrientCount = countAdapterExtractedNutrients(input.adapterResults ?? [])
  const mergedPositiveNutrientCountBeforeZeroFill = input.rawDeclarationInput
    ? countDeclaredPositiveRawValues(input.rawDeclarationInput)
    : 0
  const normalizedMatrix = input.normalizedNutrientMatrix
  const positiveNutrientCountAfterZeroFill = countPositiveMatrixValues(normalizedMatrix)
  const zeroFilledNutrientCount = countZeroFilledMatrixValues(normalizedMatrix)

  const positiveNutrientLostDuringMerge = Math.max(
    0,
    packagingAdapterNutrientCount - mergedPositiveNutrientCountBeforeZeroFill,
  )
  const positiveNutrientLostDuringZeroFill = Math.max(
    0,
    mergedPositiveNutrientCountBeforeZeroFill - positiveNutrientCountAfterZeroFill,
  )

  return {
    visionNutrientMatrixEntryCount: visionCounts.entryCount,
    visionPositiveNutrientCount: visionCounts.positiveCount,
    packagingTextNutrientCandidateCount,
    packagingAdapterNutrientCount,
    mergedPositiveNutrientCountBeforeZeroFill,
    zeroFilledNutrientCount,
    positiveNutrientCountAfterZeroFill,
    positiveNutrientLostDuringMerge,
    positiveNutrientLostDuringZeroFill,
    nutrientLossStage: resolveNutrientLossStage({
      visionPositiveNutrientCount: visionCounts.positiveCount,
      packagingTextNutrientCandidateCount,
      packagingAdapterNutrientCount,
      mergedPositiveNutrientCountBeforeZeroFill,
      positiveNutrientCountAfterZeroFill,
      positiveNutrientLostDuringMerge,
      positiveNutrientLostDuringZeroFill,
    }),
  }
}
