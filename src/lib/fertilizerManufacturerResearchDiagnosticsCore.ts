import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerManufacturerResearchDiagnostics } from '../types/fertilizerManufacturerResearchDiagnostics'

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
  }
}
