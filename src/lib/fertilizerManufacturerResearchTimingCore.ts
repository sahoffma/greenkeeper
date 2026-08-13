import type { FertilizerManufacturerDocumentFetchResult } from './fertilizerManufacturerProductDocumentAdapterCore'
import type {
  FertilizerManufacturerResearchFetchAttemptTiming,
  FertilizerManufacturerResearchFetchOutcome,
  FertilizerManufacturerResearchFetchSourceKind,
  FertilizerManufacturerResearchFetchSourcePriority,
  FertilizerManufacturerResearchTiming,
} from '../types/fertilizerManufacturerResearchTiming'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'

/** Overall budget for automatic manufacturer research inside the Netlify function. */
export const MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS = 20_000

/** Reserve kept for direct URL fallback after structured web research. */
export const MANUFACTURER_RESEARCH_DIRECT_FALLBACK_RESERVE_MS = 4_000

/** Per HTTP fetch timeout during direct URL fallback. */
export const MANUFACTURER_RESEARCH_PER_FETCH_TIMEOUT_MS = 4_000

/** Maximum direct URL candidates used only as secondary fallback. */
export const MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES = 4

/** Alias for fallback candidate cap. */
export const MANUFACTURER_RESEARCH_DIRECT_FALLBACK_MAX_CANDIDATES =
  MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES

/** Parallel fetch concurrency during automatic research. */
export const MANUFACTURER_RESEARCH_MAX_PARALLEL_FETCHES = 3

export function createEmptyManufacturerResearchTiming(): FertilizerManufacturerResearchTiming {
  return {
    totalResearchMs: 0,
    domainResolutionMs: 0,
    searchProviderMs: 0,
    candidateBuildMs: 0,
    fetchTotalMs: 0,
    parseTotalMs: 0,
    candidateCount: 0,
    fetchAttemptCount: 0,
    fetchSuccessCount: 0,
    fetchTimeoutCount: 0,
    parseSuccessCount: 0,
    stoppedAfterSuccessfulOfficialSource: false,
    fetchAttempts: [],
  }
}

export interface ManufacturerResearchCandidateRef {
  url: string
  category: string
}

export function resolveResearchFetchSourceKind(
  candidate: Pick<ManufacturerResearchCandidateRef, 'url'>,
  contentType?: string | null,
): FertilizerManufacturerResearchFetchSourceKind {
  const normalizedContentType = contentType?.split(';')[0]?.trim().toLowerCase()
  if (normalizedContentType === 'application/pdf') {
    return 'pdf'
  }

  if (normalizedContentType === 'text/html') {
    return 'html'
  }

  if (candidate.url.toLowerCase().includes('.pdf')) {
    return 'pdf'
  }

  return 'html'
}

export function resolveResearchFetchSourcePriority(
  candidate: ManufacturerResearchCandidateRef,
  fromSearchProvider: boolean,
): FertilizerManufacturerResearchFetchSourcePriority {
  if (fromSearchProvider) {
    return 'search_result'
  }

  if (
    candidate.category === 'official_document' ||
    candidate.url.toLowerCase().includes('.pdf')
  ) {
    return 'official_document'
  }

  return 'official_domain'
}

export function mapFetchResultToResearchOutcome(
  fetchResult: FertilizerManufacturerDocumentFetchResult,
): Exclude<
  FertilizerManufacturerResearchFetchOutcome,
  'parse_failed' | 'aborted' | 'skipped'
> {
  if (fetchResult.ok) {
    return 'success'
  }

  switch (fetchResult.errorCode) {
    case 'timeout':
      return 'timeout'
    case 'unsupported_source':
      return 'invalid_url'
    default:
      return 'http_error'
  }
}

export function limitOfficialResearchCandidates<T extends ManufacturerResearchCandidateRef>(input: {
  candidates: T[]
  hintedUrls: string[]
  maxCandidates: number
}): T[] {
  const hintedSet = new Set(input.hintedUrls.map((url) => url.trim()).filter(Boolean))
  const hintedCandidates = input.candidates.filter((candidate) => hintedSet.has(candidate.url))
  const generatedCandidates = input.candidates.filter((candidate) => !hintedSet.has(candidate.url))

  const remainingSlots = Math.max(input.maxCandidates - hintedCandidates.length, 0)
  return [...hintedCandidates, ...generatedCandidates.slice(0, remainingSlots)]
}

export function isResearchBudgetExhausted(startedAtMs: number, budgetMs: number, nowMs = Date.now()): boolean {
  return nowMs - startedAtMs >= budgetMs
}

export function remainingResearchBudgetMs(
  startedAtMs: number,
  budgetMs: number,
  nowMs = Date.now(),
): number {
  return Math.max(budgetMs - (nowMs - startedAtMs), 0)
}

export function resolvePerFetchTimeoutMs(
  startedAtMs: number,
  budgetMs: number,
  defaultTimeoutMs: number,
  nowMs = Date.now(),
): number {
  const remainingBudget = remainingResearchBudgetMs(startedAtMs, budgetMs, nowMs)
  if (remainingBudget <= 0) {
    return 0
  }

  return Math.min(defaultTimeoutMs, remainingBudget)
}

export function isInvalidResearchCandidateUrl(url: string): boolean {
  return validateFertilizerManufacturerDocumentSource(url.trim()).status === 'invalid'
}

export function logManufacturerResearchTiming(timing: FertilizerManufacturerResearchTiming): void {
  const { fetchAttempts: _fetchAttempts, ...summary } = timing
  console.warn('[manufacturerResearchTiming]', summary)

  for (const attempt of timing.fetchAttempts) {
    console.warn('[manufacturerResearchTiming:fetch]', attempt)
  }
}

export function summarizeFetchAttempts(
  attempts: FertilizerManufacturerResearchFetchAttemptTiming[],
): Pick<
  FertilizerManufacturerResearchTiming,
  'fetchAttemptCount' | 'fetchSuccessCount' | 'fetchTimeoutCount' | 'parseSuccessCount'
> {
  return {
    fetchAttemptCount: attempts.filter((attempt) => attempt.outcome !== 'skipped').length,
    fetchSuccessCount: attempts.filter((attempt) => attempt.outcome === 'success').length,
    fetchTimeoutCount: attempts.filter((attempt) => attempt.outcome === 'timeout').length,
    parseSuccessCount: attempts.filter((attempt) => attempt.outcome === 'success').length,
  }
}
