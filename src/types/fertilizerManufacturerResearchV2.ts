export type ManufacturerResearchV2Status = 'resolved' | 'ambiguous' | 'not_found'

export type ManufacturerResearchV2Confidence = 'high' | 'medium' | 'low'

export type ManufacturerResearchV2SourceType =
  | 'manufacturer_web_page'
  | 'manufacturer_pdf'
  | 'manufacturer_document'
  | 'other'

export interface ManufacturerResearchV2Product {
  manufacturer: string
  productLine: string | null
  productName: string
  variant: string | null
  form: 'granular' | 'liquid' | 'unknown'
  npk: {
    n: number | null
    p2o5: number | null
    k2o: number | null
    rawLabel: string | null
  }
}

export interface ManufacturerResearchV2Nutrient {
  nutrientKey: string
  value: number
  unit: string
  declarationBasis: string | null
}

export interface ManufacturerResearchV2DeclarationSource {
  url: string
  title: string | null
  sourceType: ManufacturerResearchV2SourceType
}

export interface ManufacturerResearchV2Alternative {
  manufacturer: string | null
  productLine: string | null
  productName: string | null
  variant: string | null
  npkLabel: string | null
  reasonDifferent: string | null
}

export interface ManufacturerResearchV2Ambiguity {
  unresolved: boolean
  reason: string | null
  questionForUser: string | null
}

export interface ManufacturerResearchV2Result {
  status: ManufacturerResearchV2Status
  product: ManufacturerResearchV2Product
  declaration: {
    nutrients: ManufacturerResearchV2Nutrient[]
  }
  declarationSource: ManufacturerResearchV2DeclarationSource | null
  supportingSources: Array<{ url: string; title: string | null }>
  alternatives: ManufacturerResearchV2Alternative[]
  ambiguity: ManufacturerResearchV2Ambiguity
  confidence: ManufacturerResearchV2Confidence
  shortReasoningSummary: string | null
}

export type ManufacturerResearchV2ShadowFinalDecision =
  | 'resolved_valid'
  | 'ambiguous'
  | 'rejected'
  | 'not_found'
  | 'not_executed'
  | 'error'

export interface ManufacturerResearchV2GateDiagnostics {
  schemaValid: boolean
  sourceValid: boolean
  identityContradiction: boolean
  evidenceCheckPassed: boolean
  numericSanityPassed: boolean
}

export interface ManufacturerResearchV2ShadowComparison {
  productIdentityMatch: boolean | null
  npkMatch: boolean | null
  nutrientMatrixMatch: boolean | null
  declarationSourceMatch: boolean | null
}

export interface ManufacturerResearchV2ShadowDiagnostics {
  executed: boolean
  durationMs: number | null
  status: ManufacturerResearchV2Status | 'error' | null
  identifiedProduct: {
    manufacturer: string | null
    productLine: string | null
    productName: string | null
    variant: string | null
    npkLabel: string | null
  } | null
  declarationSourceUrl: string | null
  supportingSourceCount: number | null
  nutrientCount: number | null
  positiveNutrientCount: number | null
  ambiguity: ManufacturerResearchV2Ambiguity | null
  gates: ManufacturerResearchV2GateDiagnostics | null
  finalShadowDecision: ManufacturerResearchV2ShadowFinalDecision
  comparison: ManufacturerResearchV2ShadowComparison | null
  errorMessage?: string | null
}

export interface ManufacturerResearchV2CaptureContext {
  labelText?: string | null
  recognitionConfidence?: number | null
  packageSizeLabel?: string | null
}
