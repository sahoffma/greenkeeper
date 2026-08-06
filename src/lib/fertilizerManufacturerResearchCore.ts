import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type {
  FertilizerManufacturerResearchDiagnostics,
  FertilizerManufacturerResearchFailureStage,
  FertilizerManufacturerResearchFallbackRecommendation,
} from '../types/fertilizerManufacturerResearchDiagnostics'
import type { FertilizerManufacturerDocumentFetchResult } from './fertilizerManufacturerProductDocumentAdapterCore'
import {
  mapFertilizerManufacturerDocumentToAdapterResult,
  mapValidatedContentTypeToAdapterSourceType,
} from './fertilizerManufacturerProductDocumentAdapterCore'
import type { FertilizerSourceAdapterResult } from '../types/fertilizerEnrichmentOrchestration'
import { parseFertilizerManufacturerDocumentText } from './fertilizerManufacturerDocumentParserCore'
import { resolveManufacturerDomain } from './fertilizerManufacturerDomainCore'
import {
  buildManufacturerResearchSearchQueries,
  buildOfficialSourceUrlCandidates,
  buildProductNameSearchVariants,
} from './fertilizerManufacturerResearchQueryCore'
import { extractPdfTextFromBytes } from './fertilizerPdfTextExtractionCore'

export type FertilizerOfficialSourceCandidateCategory =
  | 'official_manufacturer'
  | 'official_brand'
  | 'official_document'
  | 'verified_catalog'
  | 'retailer'
  | 'other_web'

export interface FertilizerOfficialSourceCandidate {
  url: string
  title: string
  category: FertilizerOfficialSourceCandidateCategory
  priority: number
}

export interface FertilizerManufacturerResearchSearchProvider {
  discoverOfficialSources(input: {
    identity: FertilizerEnrichmentIdentity
    queries: string[]
    manufacturerDomain: string | null
    urlCandidates: string[]
  }): Promise<FertilizerOfficialSourceCandidate[]>
}

export interface FertilizerManufacturerResearchFetchProvider {
  fetchSource(url: string): Promise<FertilizerManufacturerDocumentFetchResult>
}

export interface FertilizerManufacturerResearchResult {
  adapterResult: FertilizerSourceAdapterResult | null
  diagnostics: FertilizerManufacturerResearchDiagnostics
}

export function isProductIdentityCompleteForResearch(
  identity: FertilizerEnrichmentIdentity,
): boolean {
  return (
    !identity.hasIdentityAmbiguity &&
    Boolean(identity.manufacturer?.trim()) &&
    Boolean(identity.officialName?.trim()) &&
    Boolean(identity.identityFingerprint?.trim())
  )
}

function sourceCategoryPriority(category: FertilizerOfficialSourceCandidateCategory): number {
  switch (category) {
    case 'official_manufacturer':
      return 5
    case 'official_brand':
      return 4
    case 'official_document':
      return 4
    case 'verified_catalog':
      return 3
    case 'retailer':
      return 2
    default:
      return 1
  }
}

export function rankOfficialSourceCandidates(
  candidates: FertilizerOfficialSourceCandidate[],
): FertilizerOfficialSourceCandidate[] {
  return [...candidates].sort((left, right) => {
    const priorityDiff = right.priority - left.priority
    if (priorityDiff !== 0) {
      return priorityDiff
    }

    const leftDocument = left.url.toLowerCase().includes('.pdf') ? 1 : 0
    const rightDocument = right.url.toLowerCase().includes('.pdf') ? 1 : 0
    return rightDocument - leftDocument
  })
}

export function buildDefaultOfficialSourceCandidates(input: {
  identity: FertilizerEnrichmentIdentity
  manufacturerDomain: string | null
  hintedUrls?: string[]
}): FertilizerOfficialSourceCandidate[] {
  const candidates = new Map<string, FertilizerOfficialSourceCandidate>()

  for (const url of input.hintedUrls ?? []) {
    const trimmed = url.trim()
    if (!trimmed) {
      continue
    }

    candidates.set(trimmed, {
      url: trimmed,
      title: trimmed,
      category: trimmed.toLowerCase().includes('.pdf') ? 'official_document' : 'official_manufacturer',
      priority: sourceCategoryPriority(
        trimmed.toLowerCase().includes('.pdf') ? 'official_document' : 'official_manufacturer',
      ),
    })
  }

  for (const url of buildOfficialSourceUrlCandidates({
    identity: input.identity,
    manufacturerDomain: input.manufacturerDomain,
  })) {
    if (!candidates.has(url)) {
      candidates.set(url, {
        url,
        title: url,
        category: url.toLowerCase().includes('.pdf') ? 'official_document' : 'official_manufacturer',
        priority: sourceCategoryPriority(
          url.toLowerCase().includes('.pdf') ? 'official_document' : 'official_manufacturer',
        ),
      })
    }
  }

  return rankOfficialSourceCandidates([...candidates.values()])
}

function createSourceId(url: string): string {
  return `manufacturer-page:${url}`
}

function countDeclaredPositiveNutrients(
  parsed: ReturnType<typeof parseFertilizerManufacturerDocumentText>,
): number {
  return parsed.nutrients.filter((nutrient) => nutrient.value > 0).length
}

function resolveFailureStage(input: {
  identityComplete: boolean
  searchAttempted: boolean
  candidateCount: number
  fetchedCount: number
  parsedCount: number
  declarationSectionFound: boolean
}): FertilizerManufacturerResearchFailureStage {
  if (!input.identityComplete) {
    return 'identity_incomplete'
  }

  if (!input.searchAttempted) {
    return 'search_not_attempted'
  }

  if (input.candidateCount === 0) {
    return 'no_candidates'
  }

  if (input.fetchedCount === 0) {
    return 'fetch_failed'
  }

  if (input.parsedCount === 0) {
    return 'parse_failed'
  }

  if (!input.declarationSectionFound) {
    return 'declaration_missing'
  }

  return 'none'
}

function resolveFallbackRecommendation(
  stage: FertilizerManufacturerResearchFailureStage,
): FertilizerManufacturerResearchFallbackRecommendation {
  switch (stage) {
    case 'fetch_failed':
    case 'no_candidates':
      return 'retry_search'
    case 'parse_failed':
    case 'declaration_missing':
      return 'provide_document'
    case 'identity_incomplete':
      return 'provide_document'
    case 'search_not_attempted':
      return 'retry_search'
    case 'none':
      return 'none'
  }
}

async function extractFetchedDocumentText(
  fetchResult: Extract<FertilizerManufacturerDocumentFetchResult, { ok: true }>,
): Promise<string | null> {
  if (fetchResult.text?.trim()) {
    return fetchResult.text
  }

  return null
}

export async function runAutomaticManufacturerResearch(input: {
  identity: FertilizerEnrichmentIdentity
  hintedUrls?: string[]
  npkLabel?: string | null
  packageSizeLabel?: string | null
  searchProvider?: FertilizerManufacturerResearchSearchProvider | null
  fetchProvider: FertilizerManufacturerResearchFetchProvider
}): Promise<FertilizerManufacturerResearchResult> {
  const identityComplete = isProductIdentityCompleteForResearch(input.identity)
  const manufacturerDomain = resolveManufacturerDomain(input.identity.manufacturer)
  const searchVariants = buildProductNameSearchVariants(input.identity.officialName)
  const queries = buildManufacturerResearchSearchQueries({
    identity: input.identity,
    npkLabel: input.npkLabel,
    packageSizeLabel: input.packageSizeLabel,
  })

  const hintedUrls = input.hintedUrls ?? []
  const defaultCandidates = buildDefaultOfficialSourceCandidates({
    identity: input.identity,
    manufacturerDomain,
    hintedUrls,
  })

  let candidates = defaultCandidates
  let searchAttempted = identityComplete

  if (identityComplete && input.searchProvider) {
    const discovered = await input.searchProvider.discoverOfficialSources({
      identity: input.identity,
      queries,
      manufacturerDomain,
      urlCandidates: defaultCandidates.map((candidate) => candidate.url),
    })

    const hintedCandidates = buildDefaultOfficialSourceCandidates({
      identity: input.identity,
      manufacturerDomain,
      hintedUrls,
    }).filter((candidate) => hintedUrls.includes(candidate.url))

    candidates = rankOfficialSourceCandidates([
      ...discovered,
      ...hintedCandidates.filter(
        (candidate) => !discovered.some((entry) => entry.url === candidate.url),
      ),
    ])
  }

  const diagnosticsBase = {
    productIdentityComplete: identityComplete,
    automaticResearchAttempted: identityComplete,
    manufacturerSearchAttempted: searchAttempted,
    manufacturerDomainResolved: manufacturerDomain != null,
    searchVariantCount: searchVariants.length,
    officialSourceCandidateCount: candidates.length,
    officialSourceFetchedCount: 0,
    officialDocumentCandidateCount: candidates.filter((candidate) =>
      candidate.url.toLowerCase().includes('.pdf'),
    ).length,
    officialDocumentParsedCount: 0,
    declarationSectionFound: false,
    declaredPositiveNutrientCount: 0,
  }

  if (!identityComplete) {
    const stage = resolveFailureStage({
      identityComplete,
      searchAttempted: false,
      candidateCount: 0,
      fetchedCount: 0,
      parsedCount: 0,
      declarationSectionFound: false,
    })

    return {
      adapterResult: null,
      diagnostics: {
        ...diagnosticsBase,
        researchFailureStage: stage,
        fallbackRecommendation: resolveFallbackRecommendation(stage),
      },
    }
  }

  if (candidates.length === 0) {
    const stage = resolveFailureStage({
      identityComplete,
      searchAttempted,
      candidateCount: 0,
      fetchedCount: 0,
      parsedCount: 0,
      declarationSectionFound: false,
    })

    return {
      adapterResult: null,
      diagnostics: {
        ...diagnosticsBase,
        researchFailureStage: stage,
        fallbackRecommendation: resolveFallbackRecommendation(stage),
      },
    }
  }

  let fetchedCount = 0
  let parsedCount = 0
  let declarationSectionFound = false
  let declaredPositiveNutrientCount = 0
  let bestResult: FertilizerSourceAdapterResult | null = null

  for (const candidate of candidates) {
    const fetchResult = await input.fetchProvider.fetchSource(candidate.url)
    if (!fetchResult.ok) {
      continue
    }

    fetchedCount += 1

    let documentText = await extractFetchedDocumentText(fetchResult)
    if (!documentText?.trim()) {
      continue
    }

    let parsed: ReturnType<typeof parseFertilizerManufacturerDocumentText>
    try {
      parsed = parseFertilizerManufacturerDocumentText(documentText, input.identity)
    } catch {
      continue
    }

    if (parsed.classification === 'no_match') {
      continue
    }

    parsedCount += 1
    declarationSectionFound ||= parsed.declarationSectionLocated
    declaredPositiveNutrientCount = Math.max(
      declaredPositiveNutrientCount,
      countDeclaredPositiveNutrients(parsed),
    )

    const sourceType =
      mapValidatedContentTypeToAdapterSourceType(fetchResult.contentType) ?? 'web_page'

    const adapterResult = mapFertilizerManufacturerDocumentToAdapterResult(
      createSourceId(fetchResult.finalUrl),
      fetchResult.finalUrl,
      fetchResult.retrievedAt,
      fetchResult,
      parsed,
      sourceType,
    )

    if (adapterResult.status === 'success') {
      bestResult = {
        ...adapterResult,
        adapterType: 'manufacturer_product_page',
        sourceCategory: 'official_document',
        sourceType: 'web_page',
      }
      break
    }

    if (bestResult == null || adapterResult.status === 'partial') {
      bestResult = {
        ...adapterResult,
        adapterType: 'manufacturer_product_page',
        sourceCategory: 'official_document',
        sourceType: candidate.url.toLowerCase().includes('.pdf') ? 'pdf_document' : 'web_page',
      }
    }
  }

  const stage = resolveFailureStage({
    identityComplete,
    searchAttempted,
    candidateCount: candidates.length,
    fetchedCount,
    parsedCount,
    declarationSectionFound,
  })

  return {
    adapterResult: bestResult,
    diagnostics: {
      ...diagnosticsBase,
      officialSourceFetchedCount: fetchedCount,
      officialDocumentParsedCount: parsedCount,
      declarationSectionFound,
      declaredPositiveNutrientCount,
      researchFailureStage: bestResult ? 'none' : stage,
      fallbackRecommendation: bestResult ? 'none' : resolveFallbackRecommendation(stage),
    },
  }
}

export async function createFetchProviderFromGlobalFetch(): Promise<FertilizerManufacturerResearchFetchProvider> {
  return {
    fetchSource: async (url) => {
      const { fetchExternalManufacturerDocument } = await import(
        './fertilizerEnrichmentHttpManufacturerFetchCore'
      )
      return fetchExternalManufacturerDocument(url)
    },
  }
}

export function createPdfAwareFetchProvider(
  fetchDocument: (url: string) => Promise<FertilizerManufacturerDocumentFetchResult>,
): FertilizerManufacturerResearchFetchProvider {
  return {
    fetchSource: async (url) => {
      const result = await fetchDocument(url)
      if (!result.ok || result.text?.trim()) {
        return result
      }

      return result
    },
  }
}

export { extractPdfTextFromBytes }
