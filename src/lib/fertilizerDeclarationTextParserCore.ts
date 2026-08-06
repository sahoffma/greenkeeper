import type { FertilizerEnrichmentIdentity, FertilizerEnrichmentProductFormValue } from '../types/fertilizerEnrichment'
import type { FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'
import { mapDeclarationProductFormLabelToEnrichment } from './fertilizerRecognitionEnrichmentBasisCore'

export type FertilizerDeclarationTextClassification =
  | 'exact_match'
  | 'partial_match'
  | 'no_match'

export interface FertilizerDeclarationTextParsedNutrient {
  key: FertilizerNutrientMatrixKey
  value: number
  declarationBasis: string | null
  evidenceExcerpt: string
  fieldPath: string
}

export interface FertilizerDeclarationTextParseResult {
  extractedManufacturer: string | null
  extractedProductName: string | null
  extractedVariant: string | null
  productForm: FertilizerEnrichmentProductFormValue
  npk: {
    nitrogen: number | null
    phosphate: number | null
    potash: number | null
    declarationBasisKnown: boolean
    evidenceExcerpt: string | null
  } | null
  nutrients: FertilizerDeclarationTextParsedNutrient[]
  declarationSectionLocated: boolean
  declarationSectionFullyCaptured: boolean
  documentFullyProcessed: boolean
}

export class FertilizerDeclarationTextParserError extends Error {
  constructor(message = 'Declaration text parser failed.') {
    super(message)
    this.name = 'FertilizerDeclarationTextParserError'
  }
}

function normalizeComparable(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function extractLabeledPercent(
  text: string,
  labelPattern: RegExp,
): { value: number; excerpt: string } | null {
  const match = labelPattern.exec(text)
  if (!match?.[1]) {
    return null
  }

  const value = parseDecimal(match[1])
  if (value == null || value < 0) {
    return null
  }

  return {
    value,
    excerpt: match[0].trim().slice(0, 120),
  }
}

const NUTRIENT_LINE_PATTERNS: Array<{
  key: FertilizerNutrientMatrixKey
  pattern: RegExp
  defaultBasis: string | null
}> = [
  { key: 'nitrogen', pattern: /nitrogen\s*\(N\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'N' },
  { key: 'phosphate', pattern: /phosphate\s*\(P2O5\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'P2O5' },
  { key: 'potash', pattern: /potash\s*\(K2O\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'K2O' },
  { key: 'magnesium', pattern: /magnesium\s*\(MgO\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'MgO' },
  { key: 'calcium', pattern: /calcium\s*\(CaO\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'CaO' },
  { key: 'sulfur', pattern: /sulfur\s*\(SO3\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'SO3' },
  { key: 'iron', pattern: /iron\s*\(Fe\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'Fe' },
  { key: 'manganese', pattern: /manganese\s*\(Mn\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'Mn' },
  { key: 'copper', pattern: /copper\s*\(Cu\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'Cu' },
  { key: 'zinc', pattern: /zinc\s*\(Zn\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'Zn' },
  { key: 'boron', pattern: /boron\s*\(B\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'B' },
  { key: 'molybdenum', pattern: /molybdenum\s*\(Mo\)\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'Mo' },
  { key: 'nitrateNitrogen', pattern: /nitrate\s*nitrogen\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'N' },
  { key: 'ammoniumNitrogen', pattern: /ammonium\s*nitrogen\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'N' },
  { key: 'ureaNitrogen', pattern: /urea\s*nitrogen\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'N' },
  { key: 'organicNitrogen', pattern: /organic\s*nitrogen\s*[:=]?\s*([\d.,]+)\s*%/i, defaultBasis: 'N' },
]

function extractNpk(text: string): FertilizerDeclarationTextParseResult['npk'] {
  const match =
    /NPK\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*[-–—/]\s*(\d+(?:[.,]\d+)?)\s*[-–—/]\s*(\d+(?:[.,]\d+)?)/i.exec(
      text,
    )

  if (!match) {
    return null
  }

  const nitrogen = parseDecimal(match[1])
  const phosphate = parseDecimal(match[2])
  const potash = parseDecimal(match[3])

  if (nitrogen == null || phosphate == null || potash == null) {
    return null
  }

  const basisKnown = /declaration basis/i.test(text) || /\(N\).*P2O5.*K2O/i.test(text)

  return {
    nitrogen,
    phosphate,
    potash,
    declarationBasisKnown: basisKnown,
    evidenceExcerpt: match[0].trim().slice(0, 120),
  }
}

function extractProductForm(text: string): FertilizerEnrichmentProductFormValue {
  const match = /\bform\s*[:=]?\s*(.+)/i.exec(text)
  if (!match?.[1]) {
    return 'unknown'
  }

  return mapDeclarationProductFormLabelToEnrichment(match[1].trim())
}

export function extractDeclarationDocumentIdentity(text: string): {
  manufacturer: string | null
  productName: string | null
  variant: string | null
} {
  const manufacturer = /manufacturer\s*[:=]\s*(.+)/i.exec(text)?.[1]?.trim() ?? null
  const productName = /product\s*[:=]\s*(.+)/i.exec(text)?.[1]?.trim() ?? null
  const variant =
    /(?:variant|product variant)\s*[:=]\s*(.+)/i.exec(text)?.[1]?.trim() ??
    /NPK\s*[:=]?\s*(\d+(?:[.,]\d+)?\s*[-–—/]\s*\d+(?:[.,]\d+)?\s*[-–—/]\s*\d+(?:[.,]\d+)?)/i.exec(
      text,
    )?.[1]?.trim() ??
    null

  return { manufacturer, productName, variant }
}

export function classifyDeclarationAgainstIdentity(
  text: string,
  expectedIdentity: FertilizerEnrichmentIdentity,
  extracted: ReturnType<typeof extractDeclarationDocumentIdentity>,
  options: { requireManufacturer: boolean },
): FertilizerDeclarationTextClassification {
  const normalizedText = normalizeComparable(text)
  const expectedManufacturer = normalizeComparable(expectedIdentity.manufacturer)
  const expectedProduct = normalizeComparable(expectedIdentity.officialName)
  const expectedVariant = normalizeComparable(expectedIdentity.variant)

  const extractedManufacturer = normalizeComparable(extracted.manufacturer)
  const extractedProduct = normalizeComparable(extracted.productName)
  const extractedVariant = normalizeComparable(extracted.variant?.replace(/\s+/g, ''))

  if (extractedProduct && expectedProduct && extractedProduct !== expectedProduct) {
    return 'no_match'
  }

  if (expectedProduct && !normalizedText.includes(expectedProduct)) {
    if (extractedProduct && extractedProduct !== expectedProduct) {
      return 'no_match'
    }
    if (extractedProduct && !normalizedText.includes(extractedProduct)) {
      return 'no_match'
    }
  }

  const manufacturerMatches =
    !options.requireManufacturer ||
    (expectedManufacturer.length > 0 && normalizedText.includes(expectedManufacturer)) ||
    (extractedManufacturer.length > 0 && extractedManufacturer === expectedManufacturer)

  const productMatches =
    (expectedProduct.length > 0 && normalizedText.includes(expectedProduct)) ||
    (extractedProduct.length > 0 && extractedProduct === expectedProduct)

  if (!productMatches) {
    return 'no_match'
  }

  if (options.requireManufacturer && !manufacturerMatches) {
    return 'no_match'
  }

  if (expectedVariant) {
    const normalizedExpectedVariant = expectedVariant.replace(/\s+/g, '')
    const variantInText =
      normalizedText.includes(normalizedExpectedVariant) ||
      extractedVariant.replace(/\s+/g, '') === normalizedExpectedVariant

    if (!variantInText) {
      if (extractedVariant && extractedVariant.replace(/\s+/g, '') !== normalizedExpectedVariant) {
        return 'no_match'
      }
      return 'partial_match'
    }
  }

  return manufacturerMatches ? 'exact_match' : 'partial_match'
}

export function parseFertilizerDeclarationText(text: string): FertilizerDeclarationTextParseResult {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new FertilizerDeclarationTextParserError()
  }

  const extractedIdentity = extractDeclarationDocumentIdentity(trimmed)
  const npk = extractNpk(trimmed)
  const nutrients: FertilizerDeclarationTextParsedNutrient[] = []

  for (const entry of NUTRIENT_LINE_PATTERNS) {
    const parsed = extractLabeledPercent(trimmed, entry.pattern)
    if (!parsed) {
      continue
    }

    nutrients.push({
      key: entry.key,
      value: parsed.value,
      declarationBasis: entry.defaultBasis,
      evidenceExcerpt: parsed.excerpt,
      fieldPath: `nutrientMatrix.${entry.key}`,
    })
  }

  const declarationSectionLocated =
    /nutrient declaration/i.test(trimmed) || /npk/i.test(trimmed) || nutrients.length > 0
  const declarationSectionFullyCaptured =
    declarationSectionLocated &&
    /declaration section complete/i.test(trimmed) &&
    !/declaration section incomplete/i.test(trimmed)
  const documentFullyProcessed = !/document truncated/i.test(trimmed)

  return {
    extractedManufacturer: extractedIdentity.manufacturer,
    extractedProductName: extractedIdentity.productName,
    extractedVariant: extractedIdentity.variant,
    productForm: extractProductForm(trimmed),
    npk,
    nutrients,
    declarationSectionLocated,
    declarationSectionFullyCaptured,
    documentFullyProcessed,
  }
}

export function evaluateDeclarationVariantMatch(
  text: string,
  expectedIdentity: FertilizerEnrichmentIdentity,
  extractedVariant: string | null,
  classification: FertilizerDeclarationTextClassification,
): boolean {
  const expectedVariant = normalizeComparable(expectedIdentity.variant).replace(/\s+/g, '')
  if (expectedVariant.length === 0) {
    return true
  }

  if (classification === 'exact_match') {
    return true
  }

  const normalizedVariant = normalizeComparable(extractedVariant).replace(/\s+/g, '')
  return (
    normalizedVariant === expectedVariant || normalizeComparable(text).includes(expectedVariant)
  )
}
