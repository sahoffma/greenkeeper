import type { Product } from '../types/product'
import type {
  ProductAssistantAnalysisResult,
  ProductAssistantMatch,
  ProductAssistantPreview,
  ProductAssistantSearchOutcome,
  ProductAssistantSearchQuery,
} from '../types/productAssistant'
import type { ProductImportInput } from '../types/product'
import { normalizeProductLookupKey, stringSimilarity } from './productGovernanceCore'

const MULTIPLE_MATCH_THRESHOLD = 0.55
const EXACT_SCORE = 1
const STRONG_SINGLE_THRESHOLD = 0.88

function namesMatch(queryKey: string, product: Product): { exact: boolean; score: number } {
  if (!queryKey) {
    return { exact: false, score: 0 }
  }

  const officialKey = normalizeProductLookupKey(product.officialName)

  if (queryKey === officialKey) {
    return { exact: true, score: EXACT_SCORE }
  }

  for (const alias of product.aliases) {
    const aliasKey = normalizeProductLookupKey(alias)

    if (queryKey === aliasKey) {
      return { exact: true, score: EXACT_SCORE }
    }
  }

  const scores = [
    stringSimilarity(queryKey, product.officialName),
    ...product.aliases.map((alias) => stringSimilarity(queryKey, alias)),
  ]

  return { exact: false, score: Math.max(...scores, 0) }
}

function manufacturerMatches(queryManufacturer: string, product: Product): boolean {
  const queryKey = normalizeProductLookupKey(queryManufacturer)
  const productKey = normalizeProductLookupKey(product.manufacturer)

  if (!queryKey) {
    return true
  }

  if (!productKey) {
    return false
  }

  return queryKey === productKey || stringSimilarity(queryManufacturer, product.manufacturer) >= 0.85
}

function toMatch(product: Product, score: number, matchReason: string): ProductAssistantMatch {
  return {
    productId: product.id,
    manufacturer: product.manufacturer,
    officialName: product.officialName,
    score,
    matchReason,
  }
}

export function searchProductCatalog(
  products: Product[],
  query: ProductAssistantSearchQuery,
): ProductAssistantSearchOutcome {
  const manufacturer = query.manufacturer.trim()
  const officialName = query.officialName.trim()
  const nameKey = normalizeProductLookupKey(officialName)

  if (!manufacturer && !officialName) {
    return { kind: 'none' }
  }

  const scored: ProductAssistantMatch[] = []

  for (const product of products) {
    if (manufacturer && !manufacturerMatches(manufacturer, product)) {
      continue
    }

    const nameResult = namesMatch(nameKey, product)

    if (nameResult.exact) {
      scored.push(toMatch(product, EXACT_SCORE, 'Exakter Treffer in der Produktbibliothek.'))
      continue
    }

    if (!nameKey && manufacturer) {
      scored.push(toMatch(product, 0.75, 'Hersteller stimmt überein.'))
      continue
    }

    if (nameResult.score >= MULTIPLE_MATCH_THRESHOLD) {
      scored.push(
        toMatch(
          product,
          nameResult.score,
          `Namensähnlichkeit ${Math.round(nameResult.score * 100)} %.`,
        ),
      )
    }
  }

  scored.sort((a, b) => b.score - a.score)

  const exactMatches = scored.filter((entry) => entry.score >= EXACT_SCORE)

  if (exactMatches.length === 1) {
    return { kind: 'exact', match: exactMatches[0] }
  }

  if (exactMatches.length > 1) {
    return { kind: 'multiple', matches: exactMatches.slice(0, 5) }
  }

  if (scored.length === 1 && scored[0].score >= STRONG_SINGLE_THRESHOLD) {
    return { kind: 'exact', match: scored[0] }
  }

  if (scored.length > 0) {
    return { kind: 'multiple', matches: scored.slice(0, 5) }
  }

  return { kind: 'none' }
}

export function analysisToImportPayload(
  analysis: ProductAssistantAnalysisResult,
  fallback: ProductAssistantSearchQuery,
): ProductImportInput | null {
  const manufacturer = (analysis.manufacturer ?? fallback.manufacturer).trim() || 'Unbekannt'
  const officialName = (analysis.officialName ?? fallback.officialName).trim()

  if (!officialName) {
    return null
  }

  return {
    manufacturer,
    officialName,
    npk: analysis.npk,
    productForm: analysis.productForm,
    nPercent: analysis.nPercent,
    p2o5Percent: analysis.p2o5Percent,
    k2oPercent: analysis.k2oPercent,
    mgoPercent: analysis.mgoPercent,
    so3Percent: analysis.so3Percent,
    fePercent: analysis.fePercent,
    mnPercent: analysis.mnPercent,
    recommendedRateMin: analysis.recommendedRateMin,
    recommendedRateMax: analysis.recommendedRateMax,
    recommendedRateUnit: analysis.recommendedRateUnit,
    liquidRateMin: analysis.liquidRateMin,
    liquidRateMax: analysis.liquidRateMax,
    densityKgPerL: analysis.densityKgPerL,
    nutrientBasis: analysis.nutrientBasis,
    applicationMethod: analysis.applicationMethod,
    longevityWeeksMin: analysis.longevityWeeksMin,
    longevityWeeksMax: analysis.longevityWeeksMax,
    description: analysis.sourceDescription,
  }
}

export function buildProductAssistantPreview(
  analysis: ProductAssistantAnalysisResult,
  fallback: ProductAssistantSearchQuery,
): ProductAssistantPreview | null {
  const manufacturer = (analysis.manufacturer ?? fallback.manufacturer).trim()
  const officialName = (analysis.officialName ?? fallback.officialName).trim()

  if (!officialName) {
    return null
  }

  return {
    ...analysis,
    displayManufacturer: manufacturer || 'Unbekannt',
    displayOfficialName: officialName,
  }
}

export function inferAiFieldConfidence(
  analysis: ProductAssistantAnalysisResult,
): Record<string, number> {
  const confidence: Record<string, number> = {}

  const setIf = (key: string, present: boolean, uncertain: boolean) => {
    if (!present) return
    confidence[key] = uncertain ? 45 : 75
  }

  setIf('manufacturer', Boolean(analysis.manufacturer), analysis.uncertainFields.includes('manufacturer'))
  setIf('officialName', Boolean(analysis.officialName), analysis.uncertainFields.includes('officialName'))
  setIf('npk', Boolean(analysis.npk), analysis.uncertainFields.includes('npk'))
  setIf('nPercent', analysis.nPercent != null, analysis.uncertainFields.includes('nPercent'))
  setIf('p2o5Percent', analysis.p2o5Percent != null, analysis.uncertainFields.includes('p2o5Percent'))
  setIf('k2oPercent', analysis.k2oPercent != null, analysis.uncertainFields.includes('k2oPercent'))
  setIf('iron', analysis.fePercent != null, analysis.uncertainFields.includes('fePercent'))
  setIf('manganese', analysis.mnPercent != null, analysis.uncertainFields.includes('mnPercent'))
  setIf(
    'dosage',
    analysis.recommendedRateMin != null ||
      analysis.recommendedRateMax != null ||
      analysis.liquidRateMin != null,
    analysis.uncertainFields.some((field) => field.includes('Rate') || field.includes('dosage')),
  )
  setIf(
    'longevity',
    analysis.longevityWeeksMin != null || analysis.longevityWeeksMax != null,
    analysis.uncertainFields.some((field) => field.includes('longevity')),
  )

  return confidence
}
