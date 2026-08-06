export type FertilizerManufacturerResearchFailureStage =
  | 'identity_incomplete'
  | 'search_not_attempted'
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
}
