import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'
import type { FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'
import { parseFertilizerManufacturerDocumentText } from './fertilizerManufacturerDocumentParserCore'
import type {
  ManufacturerStructuredResearchRecord,
  ManufacturerStructuredResearchSourceRecord,
} from './fertilizerManufacturerStructuredResearchCore'
import { normalizeSearchCategory } from './fertilizerManufacturerResearchSearchProviderCore'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'

export interface ExtractManufacturerDeclarationFromCanonicalSourceInput {
  sourceText: string
  sourceUrl: string
  sourceTitle: string | null
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
}

export interface ExtractManufacturerDeclarationFromCanonicalSourceResult {
  record: ManufacturerStructuredResearchRecord
  primarySource: ManufacturerStructuredResearchSourceRecord
  declarationComplete: boolean
  extractedPositiveNutrientCount: number
}

function emptyNutrientMatrix(): ManufacturerStructuredResearchRecord['nutrientMatrix'] {
  return Object.fromEntries(FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, null])) as ManufacturerStructuredResearchRecord['nutrientMatrix']
}

const NPK_MATRIX_KEY_SET = new Set<FertilizerNutrientMatrixKey>(['nitrogen', 'phosphate', 'potash'])

function hasSecondaryOrTraceNutrientValues(
  nutrientMatrix: ManufacturerStructuredResearchRecord['nutrientMatrix'],
): boolean {
  return FERTILIZER_NUTRIENT_MATRIX_KEYS.some((key) => {
    if (NPK_MATRIX_KEY_SET.has(key as FertilizerNutrientMatrixKey)) {
      return false
    }

    return typeof nutrientMatrix[key as FertilizerNutrientMatrixKey] === 'number'
  })
}
function emptyNutrientDeclarationBases(): ManufacturerStructuredResearchRecord['nutrientDeclarationBases'] {
  return Object.fromEntries(
    FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, null]),
  ) as ManufacturerStructuredResearchRecord['nutrientDeclarationBases']
}

export function extractManufacturerDeclarationFromCanonicalSource(
  input: ExtractManufacturerDeclarationFromCanonicalSourceInput,
): ExtractManufacturerDeclarationFromCanonicalSourceResult | null {
  const parsed = parseFertilizerManufacturerDocumentText(input.sourceText, input.identity)
  if (!parsed.declarationSectionLocated) {
    return null
  }

  const nutrientMatrix = emptyNutrientMatrix()
  const nutrientDeclarationBases = emptyNutrientDeclarationBases()

  if (parsed.npk?.nitrogen != null) nutrientMatrix.nitrogen = parsed.npk.nitrogen
  if (parsed.npk?.phosphate != null) nutrientMatrix.phosphate = parsed.npk.phosphate
  if (parsed.npk?.potash != null) nutrientMatrix.potash = parsed.npk.potash

  for (const nutrient of parsed.nutrients) {
    nutrientMatrix[nutrient.key] = nutrient.value
    nutrientDeclarationBases[nutrient.key] = nutrient.declarationBasis
  }

  const npk =
    parsed.npk?.nitrogen != null &&
    parsed.npk?.phosphate != null &&
    parsed.npk?.potash != null
      ? {
          nitrogen: parsed.npk.nitrogen,
          phosphate: parsed.npk.phosphate,
          potash: parsed.npk.potash,
        }
      : null

  const normalizedSource = validateFertilizerManufacturerDocumentSource(input.sourceUrl)
  const normalizedUrl =
    normalizedSource.status === 'valid' ? normalizedSource.normalizedUrl : input.sourceUrl

  const primarySource: ManufacturerStructuredResearchSourceRecord = {
    url: normalizedUrl,
    title: input.sourceTitle ?? normalizedUrl,
    category: normalizeSearchCategory('official_manufacturer', normalizedUrl),
    sourceIdentity: {
      manufacturer: parsed.extractedManufacturer,
      productLine: input.identity.productLine ?? null,
      productName: parsed.extractedProductName,
      npkLabel: input.npkLabel ?? input.identity.variant ?? null,
    },
  }

  const extractedPositiveNutrientCount = FERTILIZER_NUTRIENT_MATRIX_KEYS.filter((key) => {
    const value = nutrientMatrix[key as FertilizerNutrientMatrixKey]
    return typeof value === 'number' && value > 0
  }).length

  const record: ManufacturerStructuredResearchRecord = {
    manufacturer: input.identity.manufacturer ?? '',
    productLine: input.identity.productLine ?? null,
    productName: input.identity.officialName ?? '',
    productForm:
      parsed.productForm === 'liquid'
        ? 'liquid'
        : parsed.productForm === 'granular'
          ? 'granular'
          : 'unknown',
    npk,
    nutrientMatrix,
    nutrientDeclarationBases,
    nutrientSourceIndices: Object.fromEntries(
      FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, 0]),
    ) as Partial<Record<FertilizerNutrientMatrixKey, number | null>>,
    declarationComplete:
      parsed.declarationSectionLocated &&
      npk != null &&
      hasSecondaryOrTraceNutrientValues(nutrientMatrix) &&
      extractedPositiveNutrientCount > 0,
    identityMatch: parsed.productScopeConfirmed,
    confidence: parsed.productScopeConfirmed ? 0.9 : 0.5,
    sources: [primarySource],
  }

  return {
    record,
    primarySource,
    declarationComplete: record.declarationComplete,
    extractedPositiveNutrientCount,
  }
}

export function phaseBExtractionUsesOnlyCanonicalSource(input: {
  record: ManufacturerStructuredResearchRecord
  canonicalUrl: string
}): boolean {
  if (input.record.sources.length !== 1) {
    return false
  }

  const sourceUrl = input.record.sources[0]?.url
  if (!sourceUrl) {
    return false
  }

  const normalizedCanonical = validateFertilizerManufacturerDocumentSource(input.canonicalUrl)
  const canonicalComparable =
    normalizedCanonical.status === 'valid'
      ? normalizedCanonical.normalizedUrl
      : input.canonicalUrl

  return sourceUrl === canonicalComparable
}
