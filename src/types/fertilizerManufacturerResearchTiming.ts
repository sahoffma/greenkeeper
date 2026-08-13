export type FertilizerManufacturerResearchFetchSourceKind = 'html' | 'pdf' | 'unknown'

export type FertilizerManufacturerResearchFetchSourcePriority =
  | 'official_domain'
  | 'official_document'
  | 'search_result'

export type FertilizerManufacturerResearchFetchOutcome =
  | 'success'
  | 'timeout'
  | 'http_error'
  | 'invalid_url'
  | 'parse_failed'
  | 'aborted'
  | 'skipped'

export interface FertilizerManufacturerResearchFetchAttemptTiming {
  candidateIndex: number
  sourceKind: FertilizerManufacturerResearchFetchSourceKind
  sourcePriority: FertilizerManufacturerResearchFetchSourcePriority
  durationMs: number
  outcome: FertilizerManufacturerResearchFetchOutcome
}

export interface FertilizerManufacturerResearchTiming {
  totalResearchMs: number
  domainResolutionMs: number
  searchProviderMs: number
  candidateBuildMs: number
  fetchTotalMs: number
  parseTotalMs: number
  candidateCount: number
  fetchAttemptCount: number
  fetchSuccessCount: number
  fetchTimeoutCount: number
  parseSuccessCount: number
  stoppedAfterSuccessfulOfficialSource: boolean
  fetchAttempts: FertilizerManufacturerResearchFetchAttemptTiming[]
}
