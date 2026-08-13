import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerManufacturerResearchDiagnostics } from '../types/fertilizerManufacturerResearchDiagnostics'
import { createEmptyManufacturerResearchTiming } from './fertilizerManufacturerResearchTimingCore'

export function readManufacturerResearchDiagnostics(
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerManufacturerResearchDiagnostics | null {
  return input.manufacturerResearchDiagnostics ?? null
}

export function createEmptyManufacturerResearchDiagnostics(): FertilizerManufacturerResearchDiagnostics {
  return {
    productIdentityComplete: false,
    automaticResearchAttempted: false,
    manufacturerSearchAttempted: false,
    manufacturerDomainResolved: false,
    searchVariantCount: 0,
    officialSourceCandidateCount: 0,
    officialSourceFetchedCount: 0,
    officialDocumentCandidateCount: 0,
    officialDocumentParsedCount: 0,
    declarationSectionFound: false,
    declaredPositiveNutrientCount: 0,
    researchFailureStage: 'search_not_attempted',
    fallbackRecommendation: 'retry_search',
    manufacturerResearchTiming: createEmptyManufacturerResearchTiming(),
    searchProviderConfigured: false,
    searchProviderAttempted: false,
    searchQueryCount: 0,
    searchResultCount: 0,
    officialSearchResultCount: 0,
    officialSearchResultFetchedCount: 0,
    searchProviderOutcome: 'not_configured',
    researchSourceStrategy: 'direct_candidates_only',
    officialDeclarationFound: false,
  }
}
