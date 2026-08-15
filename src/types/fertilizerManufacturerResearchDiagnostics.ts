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

import type { FertilizerNutrientMatrixKey } from './fertilizerReadiness'
import type { FertilizerManufacturerResearchTiming } from './fertilizerManufacturerResearchTiming'
import type {
  FertilizerManufacturerResearchSearchProviderOutcome,
  FertilizerManufacturerResearchSourceStrategy,
} from './fertilizerManufacturerResearchSearch'

export type StructuredDeclarationCompletenessRejectionReason =
  | 'none'
  | 'npk_only'
  | 'no_declaration_section'
  | 'insufficient_matrix'
  | 'identity_mismatch'
  | 'unknown'

export interface StructuredDeclarationCompletenessValidation {
  modelClaimedComplete: boolean
  declarationSectionEvidencePresent: boolean
  matrixCompletenessAccepted: boolean
  rejectionReason: StructuredDeclarationCompletenessRejectionReason
}

export interface StructuredResearchNutrientProvenanceValidationSummary {
  accepted: boolean
  rejectionReason: string
  sulfurPresentInStructuredResult: boolean
  sulfurSourcePresent: boolean
  sulfurSourceIdentityVerified: boolean
  sulfurSourceMatchesCanonicalDeclarationSource: boolean
  nutrientSourceMismatchCount: number
  mixedVariantNutrientSourceDetected: boolean
  canonicalCandidateId?: string | null
}

export interface ManufacturerSearchCandidateDiagnostic {
  candidateId: string
  url: string
  title: string | null
  evidenceKinds: string[]
  officialDomainMatch: boolean
  manufacturerEvidence: string
  productNameEvidence: string
  productLineEvidence: string
  npkEvidence: string
  identityScore: number
  hardRejected: boolean
  rejectionReason: string | null
}

export interface ManufacturerSearchResearchDecisionDiagnostic {
  accepted: boolean
  reason: string
  canonicalSource: {
    candidateId: string
    url: string
    title: string | null
    whySelected: string | null
  } | null
  nutrientSourceBindings: Array<{
    nutrientKey: string
    candidateId: string | null
    accepted: boolean
  }>
  candidateAmbiguity: boolean
  verifiedVariantCount: number
}

export interface StructuredResearchIdentityValidationSummary {
  modelClaimedIdentityMatch: boolean
  identityMatchAccepted: boolean
  rejectionReason: string
  expectedProductLinePresent: boolean
  structuredProductLinePresent: boolean
  structuredProductLineMatch: boolean
  structuredNpkMatch: boolean
  canonicalDeclarationSourcePresent: boolean
  canonicalDeclarationSourceIdentityVerified: boolean
  canonicalDeclarationSourceProductLineVerified: boolean
  canonicalDeclarationSourceNpkVerified: boolean
  declarationSourceIdentityMismatch: boolean
  structuredIdentityEchoSuspected: boolean
  sourceBoundIdentityAccepted: boolean
}

export interface FertilizerManufacturerNutrientPresenceDiagnostic {
  nutrientKey: FertilizerNutrientMatrixKey
  presentInStructuredResult: boolean
  positiveInStructuredResult: boolean
  presentAfterAdapter: boolean
  presentAfterMerge: boolean
  presentAfterNormalization: boolean
}

export interface FertilizerManufacturerNutrientChainDiagnostics {
  structuredMatrixEntryCount: number
  structuredPositiveEntryCount: number
  structuredZeroEntryCount: number
  structuredNullEntryCount: number
  adapterMatrixEntryCount: number
  adapterPositiveEntryCount: number
  mergedMatrixEntryCount: number
  mergedPositiveEntryCount: number
  normalizedMatrixEntryCount: number
  normalizedPositiveEntryCount: number
  declarationCompletenessValidation: StructuredDeclarationCompletenessValidation | null
  structuredIdentityValidation: StructuredResearchIdentityValidationSummary | null
  structuredNutrientProvenanceValidation: StructuredResearchNutrientProvenanceValidationSummary | null
  nutrientPresence: FertilizerManufacturerNutrientPresenceDiagnostic[]
}

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
  nutrientChainDiagnostics?: FertilizerManufacturerNutrientChainDiagnostics | null
  generatedSearchQueries?: string[]
  searchCandidates?: ManufacturerSearchCandidateDiagnostic[]
  finalResearchDecision?: ManufacturerSearchResearchDecisionDiagnostic | null
}
