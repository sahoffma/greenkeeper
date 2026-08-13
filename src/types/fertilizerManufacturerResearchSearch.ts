export type FertilizerManufacturerResearchSearchProviderOutcome =
  | 'success'
  | 'no_results'
  | 'timeout'
  | 'error'
  | 'not_configured'

export type FertilizerManufacturerResearchSourceStrategy =
  | 'direct_candidates_only'
  | 'search_then_direct'
  | 'search_only'
