export type FertilizerManufacturerResearchSearchProviderOutcome =
  | 'success'
  | 'no_results'
  | 'timeout'
  | 'error'
  | 'not_configured'

export type FertilizerManufacturerResearchSourceStrategy =
  | 'direct_candidates_only'
  | 'structured_web_research'
  | 'structured_then_direct_fallback'
