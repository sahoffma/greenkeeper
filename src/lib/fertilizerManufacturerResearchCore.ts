import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type {
  FertilizerManufacturerResearchDiagnostics,
  FertilizerManufacturerResearchFailureStage,
  FertilizerManufacturerResearchFallbackRecommendation,
} from '../types/fertilizerManufacturerResearchDiagnostics'
import type {
  FertilizerManufacturerResearchFetchAttemptTiming,
  FertilizerManufacturerResearchTiming,
} from '../types/fertilizerManufacturerResearchTiming'
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
import {
  createEmptyManufacturerResearchTiming,
  isInvalidResearchCandidateUrl,
  isResearchBudgetExhausted,
  limitOfficialResearchCandidates,
  logManufacturerResearchTiming,
  MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES,
  MANUFACTURER_RESEARCH_MAX_PARALLEL_FETCHES,
  MANUFACTURER_RESEARCH_PER_FETCH_TIMEOUT_MS,
  MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS,
  mapFetchResultToResearchOutcome,
  resolvePerFetchTimeoutMs,
  resolveResearchFetchSourceKind,
  resolveResearchFetchSourcePriority,
  summarizeFetchAttempts,
} from './fertilizerManufacturerResearchTimingCore'
import { extractPdfTextFromBytes } from './fertilizerPdfTextExtractionCore'

export {
  MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES,
  MANUFACTURER_RESEARCH_MAX_PARALLEL_FETCHES,
  MANUFACTURER_RESEARCH_PER_FETCH_TIMEOUT_MS,
  MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS,
} from './fertilizerManufacturerResearchTimingCore'

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
  fetchSource(
    url: string,
    options?: { timeoutMs?: number },
  ): Promise<FertilizerManufacturerDocumentFetchResult>
}

export interface FertilizerManufacturerResearchResult {
  adapterResult: FertilizerSourceAdapterResult | null
  diagnostics: FertilizerManufacturerResearchDiagnostics
}

export interface FertilizerManufacturerResearchRuntimeOptions {
  totalBudgetMs?: number
  perFetchTimeoutMs?: number
  maxOfficialCandidates?: number
  maxParallelFetches?: number
  now?: () => number
  logTiming?: boolean
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

function isCompleteOfficialDeclarationFound(
  adapterResult: FertilizerSourceAdapterResult,
): boolean {
  return adapterResult.status === 'success'
}

function finalizeDiagnostics(input: {
  diagnosticsBase: Omit<
    FertilizerManufacturerResearchDiagnostics,
    'researchFailureStage' | 'fallbackRecommendation' | 'manufacturerResearchTiming'
  >
  timing: FertilizerManufacturerResearchTiming
  bestResult: FertilizerSourceAdapterResult | null
  fetchedCount: number
  parsedCount: number
  declarationSectionFound: boolean
  declaredPositiveNutrientCount: number
  searchAttempted: boolean
  candidateCount: number
  identityComplete: boolean
  logTiming: boolean
}): FertilizerManufacturerResearchDiagnostics {
  const stage = input.bestResult
    ? 'none'
    : resolveFailureStage({
        identityComplete: input.identityComplete,
        searchAttempted: input.searchAttempted,
        candidateCount: input.candidateCount,
        fetchedCount: input.fetchedCount,
        parsedCount: input.parsedCount,
        declarationSectionFound: input.declarationSectionFound,
      })

  if (input.logTiming && input.timing.fetchAttemptCount > 0) {
    logManufacturerResearchTiming(input.timing)
  }

  return {
    ...input.diagnosticsBase,
    officialSourceFetchedCount: input.fetchedCount,
    officialDocumentParsedCount: input.parsedCount,
    declarationSectionFound: input.declarationSectionFound,
    declaredPositiveNutrientCount: input.declaredPositiveNutrientCount,
    researchFailureStage: stage,
    fallbackRecommendation: input.bestResult ? 'none' : resolveFallbackRecommendation(stage),
    manufacturerResearchTiming: input.timing,
  }
}

async function processResearchCandidates(input: {
  candidates: FertilizerOfficialSourceCandidate[]
  identity: FertilizerEnrichmentIdentity
  fetchProvider: FertilizerManufacturerResearchFetchProvider
  discoveredUrlSet: Set<string>
  researchStartedAtMs: number
  totalBudgetMs: number
  perFetchTimeoutMs: number
  maxParallelFetches: number
  now: () => number
}): Promise<{
  bestResult: FertilizerSourceAdapterResult | null
  fetchedCount: number
  parsedCount: number
  declarationSectionFound: boolean
  declaredPositiveNutrientCount: number
  stoppedAfterSuccessfulOfficialSource: boolean
  fetchAttempts: FertilizerManufacturerResearchFetchAttemptTiming[]
  fetchTotalMs: number
  parseTotalMs: number
}> {
  let fetchedCount = 0
  let parsedCount = 0
  let declarationSectionFound = false
  let declaredPositiveNutrientCount = 0
  let bestResult: FertilizerSourceAdapterResult | null = null
  let stoppedAfterSuccessfulOfficialSource = false
  const fetchAttempts: FertilizerManufacturerResearchFetchAttemptTiming[] = []
  let fetchTotalMs = 0
  let parseTotalMs = 0

  let nextCandidateIndex = 0
  let stopProcessing = false

  async function processCandidate(
    candidate: FertilizerOfficialSourceCandidate,
    candidateIndex: number,
  ): Promise<void> {
    if (stopProcessing) {
      return
    }

    const sourcePriority = resolveResearchFetchSourcePriority(
      candidate,
      input.discoveredUrlSet.has(candidate.url),
    )
    const sourceKind = resolveResearchFetchSourceKind(candidate)
    const attemptStartedAtMs = input.now()

    if (isResearchBudgetExhausted(input.researchStartedAtMs, input.totalBudgetMs, attemptStartedAtMs)) {
      fetchAttempts.push({
        candidateIndex,
        sourceKind,
        sourcePriority,
        durationMs: 0,
        outcome: 'skipped',
      })
      stopProcessing = true
      return
    }

    if (isInvalidResearchCandidateUrl(candidate.url)) {
      fetchAttempts.push({
        candidateIndex,
        sourceKind,
        sourcePriority,
        durationMs: input.now() - attemptStartedAtMs,
        outcome: 'invalid_url',
      })
      return
    }

    const fetchTimeoutMs = resolvePerFetchTimeoutMs(
      input.researchStartedAtMs,
      input.totalBudgetMs,
      input.perFetchTimeoutMs,
      attemptStartedAtMs,
    )

    if (fetchTimeoutMs <= 0) {
      fetchAttempts.push({
        candidateIndex,
        sourceKind,
        sourcePriority,
        durationMs: 0,
        outcome: 'skipped',
      })
      stopProcessing = true
      return
    }

    let fetchResult: FertilizerManufacturerDocumentFetchResult
    try {
      fetchResult = await input.fetchProvider.fetchSource(candidate.url, {
        timeoutMs: fetchTimeoutMs,
      })
    } catch {
      fetchAttempts.push({
        candidateIndex,
        sourceKind,
        sourcePriority,
        durationMs: input.now() - attemptStartedAtMs,
        outcome: 'http_error',
      })
      return
    }

    const fetchDurationMs = input.now() - attemptStartedAtMs
    fetchTotalMs += fetchDurationMs

    if (!fetchResult.ok) {
      fetchAttempts.push({
        candidateIndex,
        sourceKind: resolveResearchFetchSourceKind(candidate, null),
        sourcePriority,
        durationMs: fetchDurationMs,
        outcome: mapFetchResultToResearchOutcome(fetchResult),
      })
      return
    }

    fetchedCount += 1
    fetchAttempts.push({
      candidateIndex,
      sourceKind: resolveResearchFetchSourceKind(candidate, fetchResult.contentType),
      sourcePriority,
      durationMs: fetchDurationMs,
      outcome: 'success',
    })

    const parseStartedAtMs = input.now()
    const documentText = await extractFetchedDocumentText(fetchResult)
    if (!documentText?.trim()) {
      fetchAttempts[fetchAttempts.length - 1] = {
        ...fetchAttempts[fetchAttempts.length - 1]!,
        outcome: 'parse_failed',
      }
      return
    }

    let parsed: ReturnType<typeof parseFertilizerManufacturerDocumentText>
    try {
      parsed = parseFertilizerManufacturerDocumentText(documentText, input.identity)
    } catch {
      fetchAttempts[fetchAttempts.length - 1] = {
        ...fetchAttempts[fetchAttempts.length - 1]!,
        outcome: 'parse_failed',
      }
      parseTotalMs += input.now() - parseStartedAtMs
      return
    }

    parseTotalMs += input.now() - parseStartedAtMs

    if (parsed.classification === 'no_match') {
      fetchAttempts[fetchAttempts.length - 1] = {
        ...fetchAttempts[fetchAttempts.length - 1]!,
        outcome: 'parse_failed',
      }
      return
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

    const normalizedResult: FertilizerSourceAdapterResult = {
      ...adapterResult,
      adapterType: 'manufacturer_product_page',
      sourceCategory: 'official_document',
      sourceType: candidate.url.toLowerCase().includes('.pdf') ? 'pdf_document' : 'web_page',
    }

    if (isCompleteOfficialDeclarationFound(normalizedResult)) {
      bestResult = normalizedResult
      stoppedAfterSuccessfulOfficialSource = true
      stopProcessing = true
      return
    }

    if (bestResult == null || normalizedResult.status === 'partial') {
      bestResult = normalizedResult
    }
  }

  async function worker(): Promise<void> {
    while (!stopProcessing) {
      if (isResearchBudgetExhausted(input.researchStartedAtMs, input.totalBudgetMs, input.now())) {
        stopProcessing = true
        return
      }

      const candidateIndex = nextCandidateIndex
      nextCandidateIndex += 1

      if (candidateIndex >= input.candidates.length) {
        return
      }

      await processCandidate(input.candidates[candidateIndex]!, candidateIndex)
    }
  }

  const workerCount = Math.min(input.maxParallelFetches, input.candidates.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return {
    bestResult,
    fetchedCount,
    parsedCount,
    declarationSectionFound,
    declaredPositiveNutrientCount,
    stoppedAfterSuccessfulOfficialSource,
    fetchAttempts,
    fetchTotalMs,
    parseTotalMs,
  }
}

export async function runAutomaticManufacturerResearch(input: {
  identity: FertilizerEnrichmentIdentity
  hintedUrls?: string[]
  npkLabel?: string | null
  packageSizeLabel?: string | null
  searchProvider?: FertilizerManufacturerResearchSearchProvider | null
  fetchProvider: FertilizerManufacturerResearchFetchProvider
  runtime?: FertilizerManufacturerResearchRuntimeOptions
}): Promise<FertilizerManufacturerResearchResult> {
  const now = input.runtime?.now ?? Date.now
  const researchStartedAtMs = now()
  const totalBudgetMs = input.runtime?.totalBudgetMs ?? MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS
  const perFetchTimeoutMs =
    input.runtime?.perFetchTimeoutMs ?? MANUFACTURER_RESEARCH_PER_FETCH_TIMEOUT_MS
  const maxOfficialCandidates =
    input.runtime?.maxOfficialCandidates ?? MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES
  const maxParallelFetches =
    input.runtime?.maxParallelFetches ?? MANUFACTURER_RESEARCH_MAX_PARALLEL_FETCHES
  const logTiming = input.runtime?.logTiming ?? true

  const timing = createEmptyManufacturerResearchTiming()
  const identityComplete = isProductIdentityCompleteForResearch(input.identity)

  const domainResolutionStartedAtMs = now()
  const manufacturerDomain = resolveManufacturerDomain(input.identity.manufacturer)
  timing.domainResolutionMs = now() - domainResolutionStartedAtMs

  const searchVariants = buildProductNameSearchVariants(input.identity.officialName)
  const queries = buildManufacturerResearchSearchQueries({
    identity: input.identity,
    npkLabel: input.npkLabel,
    packageSizeLabel: input.packageSizeLabel,
  })

  const hintedUrls = input.hintedUrls ?? []

  const candidateBuildStartedAtMs = now()
  const defaultCandidates = buildDefaultOfficialSourceCandidates({
    identity: input.identity,
    manufacturerDomain,
    hintedUrls,
  })
  timing.candidateBuildMs = now() - candidateBuildStartedAtMs

  let candidates = defaultCandidates
  let searchAttempted = identityComplete
  const discoveredUrlSet = new Set<string>()

  if (identityComplete && input.searchProvider) {
    const searchProviderStartedAtMs = now()
    const discovered = await input.searchProvider.discoverOfficialSources({
      identity: input.identity,
      queries,
      manufacturerDomain,
      urlCandidates: defaultCandidates.map((candidate) => candidate.url),
    })
    timing.searchProviderMs = now() - searchProviderStartedAtMs

    for (const candidate of discovered) {
      discoveredUrlSet.add(candidate.url)
    }

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
  } else if (identityComplete) {
    candidates = limitOfficialResearchCandidates({
      candidates: defaultCandidates,
      hintedUrls,
      maxCandidates: maxOfficialCandidates,
    })
  }

  timing.candidateCount = candidates.length

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
    timing.totalResearchMs = now() - researchStartedAtMs
    return {
      adapterResult: null,
      diagnostics: finalizeDiagnostics({
        diagnosticsBase,
        timing,
        bestResult: null,
        fetchedCount: 0,
        parsedCount: 0,
        declarationSectionFound: false,
        declaredPositiveNutrientCount: 0,
        searchAttempted: false,
        candidateCount: 0,
        identityComplete,
        logTiming: false,
      }),
    }
  }

  if (candidates.length === 0) {
    timing.totalResearchMs = now() - researchStartedAtMs
    return {
      adapterResult: null,
      diagnostics: finalizeDiagnostics({
        diagnosticsBase,
        timing,
        bestResult: null,
        fetchedCount: 0,
        parsedCount: 0,
        declarationSectionFound: false,
        declaredPositiveNutrientCount: 0,
        searchAttempted,
        candidateCount: 0,
        identityComplete,
        logTiming: false,
      }),
    }
  }

  const processed = await processResearchCandidates({
    candidates,
    identity: input.identity,
    fetchProvider: input.fetchProvider,
    discoveredUrlSet,
    researchStartedAtMs,
    totalBudgetMs,
    perFetchTimeoutMs,
    maxParallelFetches,
    now,
  })

  timing.fetchTotalMs = processed.fetchTotalMs
  timing.parseTotalMs = processed.parseTotalMs
  timing.fetchAttempts = processed.fetchAttempts
  timing.stoppedAfterSuccessfulOfficialSource = processed.stoppedAfterSuccessfulOfficialSource
  Object.assign(timing, summarizeFetchAttempts(processed.fetchAttempts))
  timing.parseSuccessCount = processed.parsedCount
  timing.totalResearchMs = now() - researchStartedAtMs

  return {
    adapterResult: processed.bestResult,
    diagnostics: finalizeDiagnostics({
      diagnosticsBase,
      timing,
      bestResult: processed.bestResult,
      fetchedCount: processed.fetchedCount,
      parsedCount: processed.parsedCount,
      declarationSectionFound: processed.declarationSectionFound,
      declaredPositiveNutrientCount: processed.declaredPositiveNutrientCount,
      searchAttempted,
      candidateCount: candidates.length,
      identityComplete,
      logTiming,
    }),
  }
}

export async function createFetchProviderFromGlobalFetch(): Promise<FertilizerManufacturerResearchFetchProvider> {
  return {
    fetchSource: async (url, options) => {
      const { fetchExternalManufacturerDocument } = await import(
        './fertilizerEnrichmentHttpManufacturerFetchCore'
      )
      return fetchExternalManufacturerDocument(url, { timeoutMs: options?.timeoutMs })
    },
  }
}

export function createPdfAwareFetchProvider(
  fetchDocument: (
    url: string,
    options?: { timeoutMs?: number },
  ) => Promise<FertilizerManufacturerDocumentFetchResult>,
): FertilizerManufacturerResearchFetchProvider {
  return {
    fetchSource: async (url, options) => fetchDocument(url, options),
  }
}

export { extractPdfTextFromBytes }
