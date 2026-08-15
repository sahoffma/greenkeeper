import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type {
  FertilizerManufacturerResearchDiagnostics,
  FertilizerManufacturerResearchFailureStage,
  FertilizerManufacturerResearchFallbackRecommendation,
} from '../types/fertilizerManufacturerResearchDiagnostics'
import type {
  FertilizerManufacturerResearchTiming,
} from '../types/fertilizerManufacturerResearchTiming'
import type { FertilizerManufacturerDocumentFetchResult } from './fertilizerManufacturerProductDocumentAdapterCore'
import type { FertilizerSourceAdapterResult } from '../types/fertilizerEnrichmentOrchestration'
import { resolveManufacturerDomain } from './fertilizerManufacturerDomainCore'
import {
  buildManufacturerResearchSearchQueries,
  buildOfficialSourceUrlCandidates,
  buildProductNameSearchVariants,
} from './fertilizerManufacturerResearchQueryCore'
import {
  createEmptyManufacturerResearchTiming,
  logManufacturerResearchTiming,
  MANUFACTURER_RESEARCH_DIRECT_FALLBACK_RESERVE_MS,
  MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS,
  remainingResearchBudgetMs,
} from './fertilizerManufacturerResearchTimingCore'
import {
  MANUFACTURER_RESEARCH_STRUCTURED_BUDGET_MS,
  runManufacturerStructuredResearchAttempt,
  type FertilizerManufacturerStructuredResearchProvider,
} from './fertilizerManufacturerStructuredResearchCore'
import { buildManufacturerNutrientChainDiagnostics } from './fertilizerManufacturerNutrientChainDiagnosticsCore'
import type {
  FertilizerManufacturerResearchSearchProviderOutcome,
  FertilizerManufacturerResearchSourceStrategy,
} from '../types/fertilizerManufacturerResearchSearch'
import { extractPdfTextFromBytes } from './fertilizerPdfTextExtractionCore'
import {
  maybeAttachManufacturerResearchV2Shadow,
  type ManufacturerResearchV2Call,
} from './fertilizerManufacturerResearchV2Core'
import type { ManufacturerResearchV2CaptureContext } from '../types/fertilizerManufacturerResearchV2'

export {
  MANUFACTURER_RESEARCH_DIRECT_FALLBACK_MAX_CANDIDATES,
  MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES,
  MANUFACTURER_RESEARCH_MAX_PARALLEL_FETCHES,
  MANUFACTURER_RESEARCH_PER_FETCH_TIMEOUT_MS,
  MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS,
} from './fertilizerManufacturerResearchTimingCore'
export { MANUFACTURER_RESEARCH_STRUCTURED_BUDGET_MS } from './fertilizerManufacturerStructuredResearchCore'
export type { FertilizerManufacturerStructuredResearchProvider } from './fertilizerManufacturerStructuredResearchCore'

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
    timeoutMs?: number
  }): Promise<FertilizerOfficialSourceCandidate[]>
}

/** @deprecated Legacy URL-discovery provider; production uses structured web research. */
export type FertilizerManufacturerResearchLegacySearchProvider =
  FertilizerManufacturerResearchSearchProvider

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
  structuredBudgetMs?: number
  perFetchTimeoutMs?: number
  maxOfficialCandidates?: number
  maxParallelFetches?: number
  now?: () => number
  logTiming?: boolean
  manufacturerResearchV2ShadowEnabled?: boolean
  manufacturerResearchV2Call?: ManufacturerResearchV2Call
  openAiApiKey?: string | null
}

function resolveResearchProductName(identity: FertilizerEnrichmentIdentity): string {
  return identity.officialName?.trim() || identity.variant?.trim() || ''
}

export function isProductIdentityCompleteForResearch(
  identity: FertilizerEnrichmentIdentity,
): boolean {
  return (
    !identity.hasIdentityAmbiguity &&
    Boolean(identity.manufacturer?.trim()) &&
    Boolean(resolveResearchProductName(identity)) &&
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

export function buildCitationVerifiedDirectFetchCandidates(input: {
  citationVerifiedUrls?: string[]
  hintedUrls?: string[]
}): FertilizerOfficialSourceCandidate[] {
  const candidates = new Map<string, FertilizerOfficialSourceCandidate>()

  for (const url of [...(input.hintedUrls ?? []), ...(input.citationVerifiedUrls ?? [])]) {
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

  return rankOfficialSourceCandidates([...candidates.values()])
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

function resolveFailureStage(input: {
  identityComplete: boolean
  structuredAttempted: boolean
  structuredOutcome: FertilizerManufacturerResearchSearchProviderOutcome
  structuredResultPresent: boolean
  structuredDeclarationComplete: boolean
  directCandidateFallbackUsed: boolean
  candidateCount: number
  fetchedCount: number
  parsedCount: number
  declarationSectionFound: boolean
}): FertilizerManufacturerResearchFailureStage {
  if (!input.identityComplete) {
    return 'identity_incomplete'
  }

  if (!input.structuredAttempted) {
    return 'search_not_attempted'
  }

  if (
    input.structuredOutcome === 'timeout' &&
    !input.directCandidateFallbackUsed &&
    input.fetchedCount === 0
  ) {
    return 'structured_research_timeout'
  }

  if (
    input.structuredOutcome === 'timeout' &&
    input.directCandidateFallbackUsed &&
    input.fetchedCount === 0 &&
    input.candidateCount === 0
  ) {
    return 'structured_research_timeout'
  }

  if (
    input.structuredResultPresent &&
    !input.structuredDeclarationComplete &&
    !input.directCandidateFallbackUsed &&
    input.fetchedCount === 0
  ) {
    return 'structured_research_incomplete'
  }

  if (
    !input.structuredResultPresent &&
    (input.structuredOutcome === 'no_results' || input.structuredOutcome === 'error') &&
    input.fetchedCount === 0 &&
    input.candidateCount === 0
  ) {
    return 'structured_research_no_source'
  }

  if (input.candidateCount === 0 && input.fetchedCount === 0) {
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
    case 'structured_research_timeout':
    case 'structured_research_no_source':
      return 'retry_search'
    case 'parse_failed':
    case 'declaration_missing':
    case 'structured_research_incomplete':
      return 'provide_document'
    case 'identity_incomplete':
      return 'provide_document'
    case 'search_not_attempted':
      return 'retry_search'
    case 'none':
      return 'none'
  }
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
  structuredAttempted: boolean
  structuredAttempt: Awaited<ReturnType<typeof runManufacturerStructuredResearchAttempt>> | null
  directCandidateFallbackUsed: boolean
  candidateCount: number
  identityComplete: boolean
  logTiming: boolean
}): FertilizerManufacturerResearchDiagnostics {
  const stage = input.bestResult
    ? 'none'
    : resolveFailureStage({
        identityComplete: input.identityComplete,
        structuredAttempted: input.structuredAttempted,
        structuredOutcome:
          input.structuredAttempt?.outcome ??
          (input.structuredAttempted ? 'error' : 'not_configured'),
        structuredResultPresent: input.structuredAttempt?.structuredResearchResultPresent ?? false,
        structuredDeclarationComplete:
          input.structuredAttempt?.structuredDeclarationComplete ?? false,
        directCandidateFallbackUsed: input.directCandidateFallbackUsed,
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
    officialDeclarationFound: input.bestResult?.status === 'success',
    generatedSearchQueries: input.structuredAttempt?.generatedSearchQueries ?? [],
    searchCandidates: input.structuredAttempt?.searchCandidateDiagnostics ?? [],
    finalResearchDecision: input.structuredAttempt?.finalResearchDecision ?? null,
    nutrientChainDiagnostics: buildManufacturerNutrientChainDiagnostics({
      structuredRecord: input.structuredAttempt?.structuredRecord ?? null,
      adapterResult: input.bestResult ?? input.structuredAttempt?.adapterResult ?? null,
      declarationCompletenessValidation:
        input.structuredAttempt?.declarationCompletenessValidation ?? null,
      identityValidation: input.structuredAttempt?.identityValidation ?? null,
      nutrientProvenanceValidation: input.structuredAttempt?.nutrientProvenanceValidation ?? null,
      phaseB: input.structuredAttempt?.phaseBDiagnostics ?? null,
    }),
  }
}

async function attachManufacturerResearchV2ShadowIfEnabled(input: {
  result: FertilizerManufacturerResearchResult
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  packageSizeLabel?: string | null
  captureContext?: ManufacturerResearchV2CaptureContext | null
  fetchProvider: FertilizerManufacturerResearchFetchProvider
  runtime?: FertilizerManufacturerResearchRuntimeOptions
}): Promise<FertilizerManufacturerResearchResult> {
  const shadow = await maybeAttachManufacturerResearchV2Shadow({
    enabled: input.runtime?.manufacturerResearchV2ShadowEnabled,
    identity: input.identity,
    npkLabel: input.npkLabel,
    captureContext:
      input.captureContext ??
      ({
        packageSizeLabel: input.packageSizeLabel,
        manufacturer: input.identity.manufacturer,
        productLine: input.identity.productLine ?? null,
        productName: input.identity.officialName,
        variant: input.identity.variant,
        npkLabel: input.npkLabel ?? null,
        recognitionConfidence: input.identity.identityConfidence ?? null,
      } satisfies ManufacturerResearchV2CaptureContext),
    fetchProvider: input.fetchProvider,
    v1AdapterResult: input.result.adapterResult,
    v1Diagnostics: input.result.diagnostics,
    openAiApiKey: input.runtime?.openAiApiKey ?? process.env.OPENAI_API_KEY,
    callResearch: input.runtime?.manufacturerResearchV2Call,
  })

  if (!shadow) {
    return input.result
  }

  return {
    ...input.result,
    diagnostics: {
      ...input.result.diagnostics,
      manufacturerResearchV2Shadow: shadow,
    },
  }
}

export async function runAutomaticManufacturerResearch(input: {
  identity: FertilizerEnrichmentIdentity
  hintedUrls?: string[]
  npkLabel?: string | null
  packageSizeLabel?: string | null
  captureContext?: ManufacturerResearchV2CaptureContext | null
  structuredResearchProvider?: FertilizerManufacturerStructuredResearchProvider | null
  /** @deprecated Use structuredResearchProvider instead. */
  searchProvider?: FertilizerManufacturerResearchSearchProvider | null
  fetchProvider: FertilizerManufacturerResearchFetchProvider
  runtime?: FertilizerManufacturerResearchRuntimeOptions
}): Promise<FertilizerManufacturerResearchResult> {
  const now = input.runtime?.now ?? Date.now
  const researchStartedAtMs = now()
  const totalBudgetMs = input.runtime?.totalBudgetMs ?? MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS
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

  const candidateBuildStartedAtMs = now()
  timing.candidateBuildMs = now() - candidateBuildStartedAtMs

  const structuredResearchProvider = input.structuredResearchProvider ?? null
  const searchProviderConfigured = Boolean(structuredResearchProvider)
  let searchProviderAttempted = false
  let searchProviderOutcome: FertilizerManufacturerResearchSearchProviderOutcome =
    searchProviderConfigured ? 'error' : 'not_configured'
  let searchProviderDurationMs = 0
  let researchSourceStrategy: FertilizerManufacturerResearchSourceStrategy = 'direct_candidates_only'
  let searchResultCount = 0
  let officialSearchResultCount = 0
  let webSearchToolCallObserved = false
  let structuredResearchResultPresent = false
  let structuredDeclarationComplete = false
  let structuredPositiveNutrientCount = 0
  let directCandidateFallbackUsed = false
  let structuredAttempt: Awaited<ReturnType<typeof runManufacturerStructuredResearchAttempt>> | null =
    null
  let bestResult: FertilizerSourceAdapterResult | null = null

  if (identityComplete && structuredResearchProvider) {
    searchProviderAttempted = true
    const structuredBudgetMs = Math.min(
      input.runtime?.structuredBudgetMs ?? MANUFACTURER_RESEARCH_STRUCTURED_BUDGET_MS,
      Math.max(
        remainingResearchBudgetMs(researchStartedAtMs, totalBudgetMs, now()) -
          MANUFACTURER_RESEARCH_DIRECT_FALLBACK_RESERVE_MS,
        1_000,
      ),
    )
    const structuredStartedAtMs = now()
    structuredAttempt = await runManufacturerStructuredResearchAttempt({
      structuredResearchProvider,
      fetchProvider: input.fetchProvider,
      identity: input.identity,
      queries,
      manufacturerDomain,
      npkLabel: input.npkLabel,
      packageSizeLabel: input.packageSizeLabel,
      timeoutMs: structuredBudgetMs,
    })
    timing.searchProviderMs = now() - structuredStartedAtMs
    searchProviderDurationMs = timing.searchProviderMs
    searchProviderOutcome = structuredAttempt.outcome
    searchResultCount = structuredAttempt.webSearchSourceCount
    officialSearchResultCount = structuredAttempt.officialWebSearchSourceCount
    webSearchToolCallObserved = structuredAttempt.webSearchToolCallObserved
    structuredResearchResultPresent = structuredAttempt.structuredResearchResultPresent
    structuredDeclarationComplete = structuredAttempt.structuredDeclarationComplete
    structuredPositiveNutrientCount = structuredAttempt.structuredPositiveNutrientCount

    if (
      structuredAttempt.adapterResult?.status === 'success' &&
      structuredAttempt.nutrientProvenanceValidation?.accepted === true &&
      structuredAttempt.structuredDeclarationComplete &&
      structuredAttempt.structuredPositiveNutrientCount > 0
    ) {
      researchSourceStrategy = 'structured_web_research'
      bestResult = structuredAttempt.adapterResult
    }
  } else if (identityComplete) {
    searchProviderOutcome = 'not_configured'
    directCandidateFallbackUsed = true
    researchSourceStrategy = 'direct_candidates_only'
  }

  const buildDiagnosticsBase = (candidateCount: number) => ({
    productIdentityComplete: identityComplete,
    automaticResearchAttempted: identityComplete,
    manufacturerSearchAttempted: searchProviderAttempted || directCandidateFallbackUsed,
    manufacturerDomainResolved: manufacturerDomain != null,
    searchVariantCount: searchVariants.length,
    officialSourceCandidateCount: candidateCount,
    officialSourceFetchedCount: 0,
    officialDocumentCandidateCount: 0,
    officialDocumentParsedCount: 0,
    declarationSectionFound: false,
    declaredPositiveNutrientCount: structuredPositiveNutrientCount,
    searchProviderConfigured,
    searchProviderAttempted,
    searchQueryCount: searchProviderAttempted ? queries.length : 0,
    searchResultCount,
    officialSearchResultCount,
    officialSearchResultFetchedCount: 0,
    searchProviderOutcome,
    searchProviderDurationMs,
    webSearchToolCallObserved,
    webSearchSourceCount: searchResultCount,
    officialWebSearchSourceCount: officialSearchResultCount,
    structuredResearchResultPresent,
    structuredDeclarationComplete,
    structuredPositiveNutrientCount,
    directCandidateFallbackUsed,
    researchSourceStrategy,
    officialDeclarationFound: bestResult?.status === 'success',
  })

  if (!identityComplete) {
    timing.totalResearchMs = now() - researchStartedAtMs
    return attachManufacturerResearchV2ShadowIfEnabled({
      result: {
        adapterResult: null,
        diagnostics: finalizeDiagnostics({
          diagnosticsBase: buildDiagnosticsBase(0),
          timing,
          bestResult: null,
          fetchedCount: 0,
          parsedCount: 0,
          declarationSectionFound: false,
          declaredPositiveNutrientCount: 0,
          structuredAttempted: false,
          structuredAttempt: null,
          directCandidateFallbackUsed: false,
          candidateCount: 0,
          identityComplete,
          logTiming: false,
        }),
      },
      identity: input.identity,
      npkLabel: input.npkLabel,
      packageSizeLabel: input.packageSizeLabel,
      captureContext: input.captureContext,
      fetchProvider: input.fetchProvider,
      runtime: input.runtime,
    })
  }

  if (bestResult) {
    timing.candidateCount = 0
    timing.totalResearchMs = now() - researchStartedAtMs
    return attachManufacturerResearchV2ShadowIfEnabled({
      result: {
        adapterResult: bestResult,
        diagnostics: finalizeDiagnostics({
          diagnosticsBase: buildDiagnosticsBase(0),
          timing,
          bestResult,
          fetchedCount: 0,
          parsedCount: 0,
          declarationSectionFound: structuredDeclarationComplete,
          declaredPositiveNutrientCount: structuredPositiveNutrientCount,
          structuredAttempted: searchProviderAttempted,
          structuredAttempt,
          directCandidateFallbackUsed: false,
          candidateCount: 0,
          identityComplete,
          logTiming,
        }),
      },
      identity: input.identity,
      npkLabel: input.npkLabel,
      packageSizeLabel: input.packageSizeLabel,
      captureContext: input.captureContext,
      fetchProvider: input.fetchProvider,
      runtime: input.runtime,
    })
  }

  timing.totalResearchMs = now() - researchStartedAtMs
  return attachManufacturerResearchV2ShadowIfEnabled({
    result: {
      adapterResult: null,
      diagnostics: finalizeDiagnostics({
        diagnosticsBase: buildDiagnosticsBase(0),
        timing,
        bestResult: null,
        fetchedCount: 0,
        parsedCount: 0,
        declarationSectionFound: structuredDeclarationComplete,
        declaredPositiveNutrientCount: structuredPositiveNutrientCount,
        structuredAttempted: searchProviderAttempted,
        structuredAttempt,
        directCandidateFallbackUsed: false,
        candidateCount: 0,
        identityComplete,
        logTiming: false,
      }),
    },
    identity: input.identity,
    npkLabel: input.npkLabel,
    packageSizeLabel: input.packageSizeLabel,
    captureContext: input.captureContext,
    fetchProvider: input.fetchProvider,
    runtime: input.runtime,
  })
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
