import type { Product } from '../types/product'
import type {
  ProductRecognizeCatalogItem,
  ProductRecognizeCatalogMatch,
  ProductRecognizeFormValue,
  ProductRecognizeImageAnalysis,
  ProductRecognizeRecognition,
} from '../types/productRecognize'
import { searchProductCatalog } from './productAssistantCore'
import { normalizeBrand } from './productRecognizeIdentityCore'
import { normalizeProductLookupKey, stringSimilarity } from './productGovernanceCore'

export const FUZZY_MATCH_THRESHOLD = 0.88
export const AMBIGUOUS_FUZZY_THRESHOLD = 0.55

function normalizeGtin(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

export function productToCatalogItem(product: Product): ProductRecognizeCatalogItem {
  const gtinAlias = product.aliases.find((alias) => /^\d{8,14}$/.test(alias.replace(/\D/g, '')))

  return {
    id: product.id,
    manufacturer: product.manufacturer,
    officialName: product.officialName,
    aliases: product.aliases,
    gtin: gtinAlias ? normalizeGtin(gtinAlias) : null,
    npk: product.npk,
    productForm: product.productForm,
    nPercent: product.nPercent,
    p2o5Percent: product.p2o5Percent,
    k2oPercent: product.k2oPercent,
    recommendedRateMin: product.recommendedRateMin,
    recommendedRateMax: product.recommendedRateMax,
    recommendedRateUnit: product.recommendedRateUnit,
    longevityWeeksMin: product.longevityWeeksMin,
    longevityWeeksMax: product.longevityWeeksMax,
    seasonMonths: product.seasonMonths,
    defaultUnit: product.defaultUnit,
    manufacturerUrl: product.manufacturerUrl,
  }
}

function mapForm(value: string | null | undefined): ProductRecognizeFormValue {
  if (value === 'granular' || value === 'liquid') {
    return value
  }

  return 'unknown'
}

function findGtinMatch(
  gtin: string | null,
  catalog: ProductRecognizeCatalogItem[],
): ProductRecognizeCatalogItem | null {
  const normalized = normalizeGtin(gtin)

  if (!normalized) {
    return null
  }

  for (const item of catalog) {
    const itemGtin = normalizeGtin(item.gtin ?? undefined)

    if (itemGtin && itemGtin === normalized) {
      return item
    }

    for (const alias of item.aliases) {
      const aliasGtin = normalizeGtin(alias)

      if (aliasGtin && aliasGtin === normalized) {
        return item
      }
    }
  }

  return null
}

export interface CatalogResolveResult {
  match: ProductRecognizeCatalogMatch
  ambiguousProductIds: string[]
}

export function resolveCatalogMatch(
  catalog: ProductRecognizeCatalogItem[],
  analysis: ProductRecognizeImageAnalysis,
): CatalogResolveResult {
  const gtinMatch = findGtinMatch(analysis.gtin, catalog)

  if (gtinMatch) {
    return {
      match: {
        matched: true,
        productId: gtinMatch.id,
        matchType: 'gtin_exact',
        confidence: 1,
      },
      ambiguousProductIds: [],
    }
  }

  const manufacturer =
    analysis.manufacturer ?? normalizeBrand(analysis.brand) ?? analysis.brand ?? ''
  const nameParts = [analysis.productName, analysis.variant].filter(Boolean)
  const officialName = [...new Set(nameParts)].join(' ').trim()

  const products = catalog.map((item) => ({
    id: item.id,
    manufacturer: item.manufacturer,
    officialName: item.officialName,
    aliases: item.aliases,
    category: null,
    npk: item.npk ?? null,
    defaultUnit: item.defaultUnit ?? null,
    productForm: (item.productForm as Product['productForm']) ?? null,
    productType: null,
    nPercent: item.nPercent ?? null,
    p2o5Percent: item.p2o5Percent ?? null,
    k2oPercent: item.k2oPercent ?? null,
    mgoPercent: null,
    so3Percent: null,
    fePercent: null,
    mnPercent: null,
    recommendedRateMin: item.recommendedRateMin ?? null,
    recommendedRateMax: item.recommendedRateMax ?? null,
    recommendedRateUnit: item.recommendedRateUnit ?? null,
    liquidRateMin: null,
    liquidRateMax: null,
    densityKgPerL: null,
    nutrientBasis: null,
    dilutionMin: null,
    dilutionMax: null,
    waterRateMin: null,
    waterRateMax: null,
    applicationMethod: null,
    longevityWeeksMin: item.longevityWeeksMin ?? null,
    longevityWeeksMax: item.longevityWeeksMax ?? null,
    releaseType: null,
    seasonMonths: item.seasonMonths ?? null,
    description: null,
    manufacturerUrl: item.manufacturerUrl ?? null,
    datasheetUrl: null,
    sourceName: null,
    sourceCheckedAt: null,
    verificationStatus: null,
    verifiedAt: null,
    verifiedBy: null,
    lastReviewedAt: null,
    currentVersion: null,
    confidenceScore: null,
    fieldConfidence: {},
    aiConfidenceScore: null,
    reviewConfidenceScore: null,
    aiFieldConfidence: {},
    reviewFieldConfidence: {},
    sources: [],
    primarySourceType: null,
    primarySourceUrl: null,
    hasOpenChangeRequest: false,
    legacyImportedAt: null,
    legacyImportNote: null,
  }))

  const outcome = searchProductCatalog(products as unknown as Product[], {
    manufacturer,
    officialName,
  })

  if (outcome.kind === 'exact') {
    const matchType = outcome.match.score >= 1 ? 'exact' : 'fuzzy'

    if (outcome.match.score < FUZZY_MATCH_THRESHOLD && matchType === 'fuzzy') {
      return {
        match: {
          matched: false,
          productId: null,
          matchType: 'none',
          confidence: outcome.match.score,
        },
        ambiguousProductIds: [],
      }
    }

    return {
      match: {
        matched: true,
        productId: outcome.match.productId,
        matchType,
        confidence: outcome.match.score,
      },
      ambiguousProductIds: [],
    }
  }

  if (outcome.kind === 'multiple') {
    const topScore = outcome.matches[0]?.score ?? 0
    const strongMatches = outcome.matches.filter((entry) => entry.score >= FUZZY_MATCH_THRESHOLD)

    if (strongMatches.length === 1) {
      return {
        match: {
          matched: true,
          productId: strongMatches[0].productId,
          matchType: 'fuzzy',
          confidence: strongMatches[0].score,
        },
        ambiguousProductIds: [],
      }
    }

    if (strongMatches.length > 1) {
      return {
        match: {
          matched: false,
          productId: null,
          matchType: 'fuzzy',
          confidence: topScore,
        },
        ambiguousProductIds: strongMatches.map((entry) => entry.productId),
      }
    }

    return {
      match: {
        matched: false,
        productId: null,
        matchType: topScore >= AMBIGUOUS_FUZZY_THRESHOLD ? 'fuzzy' : 'none',
        confidence: topScore,
      },
      ambiguousProductIds: outcome.matches.map((entry) => entry.productId),
    }
  }

  return {
    match: {
      matched: false,
      productId: null,
      matchType: 'none',
      confidence: 0,
    },
    ambiguousProductIds: [],
  }
}

export function mergeCatalogIntoRecognition(
  recognition: ProductRecognizeRecognition,
  item: ProductRecognizeCatalogItem,
  matchConfidence: number,
): ProductRecognizeRecognition {
  const next = structuredClone(recognition)
  const confidence = Math.max(matchConfidence, 0.9)

  next.manufacturer = {
    rawValue: item.manufacturer,
    normalizedValue: item.manufacturer,
    confidence,
    source: 'verified_catalog',
    evidence: item.officialName,
    sourceCategory: 'verified_catalog',
  }
  next.productName = {
    rawValue: item.officialName,
    normalizedValue: item.officialName,
    confidence,
    source: 'verified_catalog',
    evidence: item.officialName,
    sourceCategory: 'verified_catalog',
  }

  if (item.productForm) {
    next.form = {
      rawValue: item.productForm,
      normalizedValue: mapForm(item.productForm),
      confidence: Math.max(matchConfidence, 0.85),
      source: 'verified_catalog',
      evidence: item.productForm,
    }
  }

  if (item.nPercent != null || item.p2o5Percent != null || item.k2oPercent != null) {
    next.npk = {
      rawLabel: item.npk ?? next.npk.rawLabel,
      nitrogen: item.nPercent ?? null,
      phosphate: item.p2o5Percent ?? null,
      potash: item.k2oPercent ?? null,
      confidence: Math.max(matchConfidence, 0.85),
      source: 'verified_catalog',
      evidence: item.npk ?? null,
      sourceCategory: 'verified_catalog',
    }
  }

  if (item.recommendedRateMin != null || item.recommendedRateMax != null) {
    next.application.rate = {
      value: item.recommendedRateMax ?? item.recommendedRateMin ?? null,
      unit: item.recommendedRateUnit ?? null,
      source: 'verified_catalog',
      evidence: `${item.recommendedRateMax ?? item.recommendedRateMin} ${item.recommendedRateUnit ?? ''}`.trim(),
      sourceCategory: 'verified_catalog',
    }
  }

  if (item.longevityWeeksMin != null || item.longevityWeeksMax != null) {
    const weeks = item.longevityWeeksMax ?? item.longevityWeeksMin ?? null
    next.application.duration = {
      value: weeks != null ? weeks / 4.345 : null,
      unit: weeks != null ? 'months' : null,
      source: 'verified_catalog',
      evidence: weeks != null ? `${weeks} Wochen` : null,
      sourceCategory: 'verified_catalog',
    }
  }

  return next
}

export function summarizeCatalogMatch(result: CatalogResolveResult): string {
  if (result.match.matched && result.match.productId) {
    return `Katalogtreffer (${result.match.matchType}, ${Math.round(result.match.confidence * 100)} %).`
  }

  if (result.ambiguousProductIds.length > 1) {
    return `${result.ambiguousProductIds.length} plausible Katalogtreffer — Variante unklar.`
  }

  return 'Kein ausreichender Katalogtreffer.'
}

export function namesArePlausibleVariantConflict(
  analysis: ProductRecognizeImageAnalysis,
  catalog: ProductRecognizeCatalogItem[],
  ambiguousIds: string[],
): boolean {
  if (ambiguousIds.length < 2) {
    return false
  }

  const names = ambiguousIds
    .map((id) => catalog.find((item) => item.id === id))
    .filter((item): item is ProductRecognizeCatalogItem => item != null)
    .map((item) => normalizeProductLookupKey(item.officialName))

  const unique = new Set(names)

  if (unique.size <= 1) {
    return false
  }

  const query = normalizeProductLookupKey(
    [analysis.productName, analysis.variant].filter(Boolean).join(' '),
  )

  return names.some((name) => stringSimilarity(query, name) >= AMBIGUOUS_FUZZY_THRESHOLD)
}
