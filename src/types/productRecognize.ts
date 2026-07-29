/** Technical spike (GA-013) — nicht produktiv. */

export type ProductRecognizeStatus =
  | 'identified'
  | 'needs_clarification'
  | 'not_identified'
  | 'error'

export type ProductRecognizeWebSourceCategory =
  | 'official_manufacturer'
  | 'official_brand'
  | 'verified_catalog'
  | 'retailer'
  | 'other_web'

export type ProductRecognizeFieldSource =
  | 'image'
  | 'catalog'
  | 'official_manufacturer'
  | 'official_brand'
  | 'verified_catalog'
  | 'retailer'
  | 'other_web'
  | null

export type ProductRecognizeSourceType =
  | 'image'
  | 'catalog'
  | 'official_manufacturer'
  | 'official_brand'
  | 'verified_catalog'
  | 'retailer'
  | 'other_web'

export type ProductRecognizeMatchType = 'gtin_exact' | 'exact' | 'fuzzy' | 'none'

export type ProductRecognizeFormValue = 'granular' | 'liquid' | 'unknown'

export type ProductRecognizeNextActionType =
  | 'none'
  | 'ask_question'
  | 'request_back_photo'

export interface ProductRecognizeEvidenceField {
  rawValue: string | null
  normalizedValue: string | null
  confidence: number
  source: ProductRecognizeFieldSource
  evidence: string | null
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceCategory?: ProductRecognizeWebSourceCategory | null
  retrievedAt?: string | null
}

export interface ProductRecognizeFormField {
  rawValue: string | null
  normalizedValue: ProductRecognizeFormValue
  confidence: number
  source: ProductRecognizeFieldSource
  evidence: string | null
}

export interface ProductRecognizePackageSizeField {
  rawValue: string | null
  normalizedValue: number | null
  unit: string | null
  confidence: number
  source: ProductRecognizeFieldSource
  evidence: string | null
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceCategory?: ProductRecognizeWebSourceCategory | null
  retrievedAt?: string | null
}

export interface ProductRecognizeNpkField {
  rawLabel: string | null
  nitrogen: number | null
  phosphate: number | null
  potash: number | null
  confidence: number
  source: ProductRecognizeFieldSource
  evidence: string | null
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceCategory?: ProductRecognizeWebSourceCategory | null
  retrievedAt?: string | null
}

export interface ProductRecognizeNutrientField {
  name: string
  value: number
  unit: '%'
  confidence: number
  source: Exclude<ProductRecognizeFieldSource, 'image' | null>
  evidence: string | null
  sourceUrl: string | null
  sourceTitle: string | null
  sourceCategory: ProductRecognizeWebSourceCategory
  retrievedAt: string
}

export interface ProductRecognizeRateField {
  value: number | null
  unit: string | null
  source: ProductRecognizeFieldSource
  evidence: string | null
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceCategory?: ProductRecognizeWebSourceCategory | null
  retrievedAt?: string | null
}

export interface ProductRecognizeCoverageField {
  value: number | null
  unit: string | null
  source: ProductRecognizeFieldSource
  evidence: string | null
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceCategory?: ProductRecognizeWebSourceCategory | null
  retrievedAt?: string | null
}

export interface ProductRecognizeApplicationPeriod {
  label: string
  fromMonth: number
  toMonth: number
  source: ProductRecognizeFieldSource
  evidence: string | null
  sourceUrl?: string | null
}

export interface ProductRecognizeDurationField {
  value: number | null
  unit: string | null
  source: ProductRecognizeFieldSource
  evidence: string | null
  sourceUrl?: string | null
  sourceTitle?: string | null
  sourceCategory?: ProductRecognizeWebSourceCategory | null
  retrievedAt?: string | null
}

export interface ProductRecognizeApplication {
  rate: ProductRecognizeRateField
  coverage: ProductRecognizeCoverageField
  applicationPeriod: ProductRecognizeApplicationPeriod[]
  duration: ProductRecognizeDurationField
}

export interface ProductRecognizeRecognition {
  brand: ProductRecognizeEvidenceField
  productLine: ProductRecognizeEvidenceField
  productName: ProductRecognizeEvidenceField
  variant: ProductRecognizeEvidenceField
  manufacturer: ProductRecognizeEvidenceField
  productDescriptor: ProductRecognizeEvidenceField
  form: ProductRecognizeFormField
  packageSize: ProductRecognizePackageSizeField
  npk: ProductRecognizeNpkField
  nutrients: ProductRecognizeNutrientField[]
  application: ProductRecognizeApplication
}

export interface ProductRecognizeCatalogMatch {
  matched: boolean
  productId: string | null
  matchType: ProductRecognizeMatchType
  confidence: number
}

export interface ProductRecognizeSourceRecord {
  type: ProductRecognizeSourceType
  title: string
  url: string | null
  retrievedAt: string
  evidence?: string | null
}

export interface ProductRecognizeNextAction {
  type: ProductRecognizeNextActionType
  message: string | null
}

export interface ProductRecognizeImagePrepDiagnostics {
  originalFormat: string
  processedFormat: string
  originalBytes: number
  processedBytes: number
  originalWidth: number | null
  originalHeight: number | null
  processedWidth: number | null
  processedHeight: number | null
  conversionMs: number
  compressionMs: number
  converted: boolean
}

export interface ProductRecognizePipelineLatencies {
  imagePrepMs: number
  imageAnalysisMs: number
  catalogSearchMs: number
  webEnrichmentMs: number
  decisionMs: number
  totalMs: number
}

export interface ProductRecognizeDiagnostics {
  model: string
  latencyMs: number
  estimatedCost: number | null
  warnings: string[]
  imagePrep?: ProductRecognizeImagePrepDiagnostics
  searchProvider?: string
  pipelineLatencies?: ProductRecognizePipelineLatencies
}

export interface ProductRecognizeStockCaptureDecision {
  allowed: boolean
  recognitionCandidate: true
  persistToCatalog: false
  message: string | null
}

export interface ProductRecognizePipelineStep {
  id: 'image_prep' | 'image_analysis' | 'catalog_search' | 'web_enrichment' | 'decision'
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed'
  summary: string
  detail?: string
}

export interface ProductRecognizeResult {
  status: ProductRecognizeStatus
  identityConfidence: number
  dataCompleteness: number
  recognition: ProductRecognizeRecognition
  catalogMatch: ProductRecognizeCatalogMatch
  sources: ProductRecognizeSourceRecord[]
  missingRequiredFields: string[]
  nextAction: ProductRecognizeNextAction
  stockCapture: ProductRecognizeStockCaptureDecision
  diagnostics: ProductRecognizeDiagnostics
  steps: ProductRecognizePipelineStep[]
  spike: true
}

/** Sichtbare Merkmale aus der Vorderseite — keine Halluzinationen. */
export interface ProductRecognizeImageAnalysis {
  brand: string | null
  productLine: string | null
  productName: string | null
  variant: string | null
  productDescriptor: string | null
  manufacturer: string | null
  npkLabel: string | null
  nitrogen: number | null
  phosphate: number | null
  potash: number | null
  packageSizeValue: number | null
  packageSizeUnit: string | null
  form: ProductRecognizeFormValue | null
  gtin: string | null
  textFragments: string[]
  fieldConfidence: Record<string, number>
}

export interface ProductRecognizeCatalogItem {
  id: string
  manufacturer: string
  officialName: string
  aliases: string[]
  gtin?: string | null
  npk?: string | null
  productForm?: string | null
  nPercent?: number | null
  p2o5Percent?: number | null
  k2oPercent?: number | null
  recommendedRateMin?: number | null
  recommendedRateMax?: number | null
  recommendedRateUnit?: string | null
  longevityWeeksMin?: number | null
  longevityWeeksMax?: number | null
  seasonMonths?: number[] | null
  defaultUnit?: string | null
  manufacturerUrl?: string | null
}

export interface ProductRecognizeWebSource {
  url: string
  title: string
  category: ProductRecognizeWebSourceCategory
  retrievedAt: string
}

export interface ProductRecognizeWebFieldExtraction {
  field: string
  value: string | number | Record<string, number> | null
  unit?: string | null
  confidence: number
  sourceUrl: string
  sourceTitle: string
  sourceCategory: ProductRecognizeWebSourceCategory
  evidence: string | null
  retrievedAt: string
}

export interface ProductRecognizeWebExtraction {
  fields: ProductRecognizeWebFieldExtraction[]
  conflicts: string[]
  sources: ProductRecognizeWebSource[]
  provider: string
  failed?: boolean
}

export interface PreparedProductRecognizeImage {
  base64: string
  mimeType: string
  prep: ProductRecognizeImagePrepDiagnostics
}
