export type FertilizerManufacturerResearchFailureStage =
  | 'identity_incomplete'
  | 'search_not_attempted'
  | 'structured_research_timeout'
  | 'structured_research_no_source'
  | 'structured_research_incomplete'
  | 'no_candidates'
  | 'fetch_failed'
  | 'parse_failed'
  | 'declaration_missing'
  | 'none'

export type FertilizerManufacturerResearchFallbackRecommendation =
  | 'retry_search'
  | 'provide_document'
  | 'optional_back_photo'
  | 'none'

import type { FertilizerManufacturerResearchTiming } from './fertilizerManufacturerResearchTiming'
import type {
  FertilizerManufacturerResearchSearchProviderOutcome,
  FertilizerManufacturerResearchSourceStrategy,
} from './fertilizerManufacturerResearchSearch'

export interface FertilizerManufacturerResearchDiagnostics {
  productIdentityComplete: boolean
  automaticResearchAttempted: boolean
  manufacturerSearchAttempted: boolean
  manufacturerDomainResolved: boolean
  searchVariantCount: number
  officialSourceCandidateCount: number
  officialSourceFetchedCount: number
  officialDocumentCandidateCount: number
  officialDocumentParsedCount: number
  declarationSectionFound: boolean
  declaredPositiveNutrientCount: number
  researchFailureStage: FertilizerManufacturerResearchFailureStage
  fallbackRecommendation: FertilizerManufacturerResearchFallbackRecommendation
  manufacturerResearchTiming?: FertilizerManufacturerResearchTiming | null
  searchProviderConfigured: boolean
  searchProviderAttempted: boolean
  searchQueryCount: number
  searchResultCount: number
  officialSearchResultCount: number
  officialSearchResultFetchedCount: number
  searchProviderOutcome: FertilizerManufacturerResearchSearchProviderOutcome
  searchProviderDurationMs: number
  webSearchToolCallObserved: boolean
  webSearchSourceCount: number
  officialWebSearchSourceCount: number
  structuredResearchResultPresent: boolean
  structuredDeclarationComplete: boolean
  structuredPositiveNutrientCount: number
  directCandidateFallbackUsed: boolean
  researchSourceStrategy: FertilizerManufacturerResearchSourceStrategy
  officialDeclarationFound: boolean
}
