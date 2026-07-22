import type { ApplicationMethod, NutrientBasis, ProductForm } from './product'
import type { ProductSubmissionChannel } from './productGovernance'

/** Kanal aus der Nutzer-Perspektive – wird auf DB-Enums gemappt. */
export type ProductAssistantInputChannel =
  | 'photo_upload'
  | 'manual_entry'
  | 'url_import'
  | 'pdf_upload'

/** Quelle im Produkt-Lern-Assistenten (Spracheingabe-Flow). */
export type ProductLearnSourceType = 'photos' | 'manufacturer_url' | 'shop_url' | 'pdf'

export function mapAssistantChannel(
  channel: ProductAssistantInputChannel,
  sourceType?: ProductLearnSourceType,
): ProductSubmissionChannel {
  switch (channel) {
    case 'photo_upload':
      return 'photo_import'
    case 'pdf_upload':
      return 'pdf_import'
    case 'url_import':
      return sourceType === 'shop_url' ? 'other' : 'manufacturer_import'
    case 'manual_entry':
    default:
      return 'user_manual'
  }
}

export function mapLearnSourceToInputChannel(
  sourceType: ProductLearnSourceType,
): ProductAssistantInputChannel {
  switch (sourceType) {
    case 'photos':
      return 'photo_upload'
    case 'pdf':
      return 'pdf_upload'
    case 'manufacturer_url':
    case 'shop_url':
      return 'url_import'
  }
}

export interface ProductAssistantSearchQuery {
  manufacturer: string
  officialName: string
}

export interface ProductAssistantMatch {
  productId: string
  manufacturer: string
  officialName: string
  score: number
  matchReason: string
}

export type ProductAssistantSearchOutcome =
  | { kind: 'exact'; match: ProductAssistantMatch }
  | { kind: 'multiple'; matches: ProductAssistantMatch[] }
  | { kind: 'none' }

/** KI-Antwort vom Server (strukturiert, ohne direktes Speichern). */
export interface ProductAssistantAnalysisResult {
  devMode: boolean
  manufacturer: string | null
  officialName: string | null
  productForm: ProductForm | null
  npk: string | null
  nPercent: number | null
  p2o5Percent: number | null
  k2oPercent: number | null
  mgoPercent: number | null
  so3Percent: number | null
  fePercent: number | null
  mnPercent: number | null
  recommendedRateMin: number | null
  recommendedRateMax: number | null
  recommendedRateUnit: string | null
  liquidRateMin: number | null
  liquidRateMax: number | null
  densityKgPerL: number | null
  nutrientBasis: NutrientBasis | null
  applicationMethod: ApplicationMethod | null
  longevityWeeksMin: number | null
  longevityWeeksMax: number | null
  sourceDescription: string | null
  missingFields: string[]
  uncertainFields: string[]
  warnings: string[]
}

export interface ProductAssistantPreview extends ProductAssistantAnalysisResult {
  displayManufacturer: string
  displayOfficialName: string
}

export interface ProductAssistantImageInput {
  base64: string
  mimeType: string
}

export interface ProductAssistantAnalyzeRequest {
  manufacturer?: string
  officialName?: string
  /** Produktname aus der Spracheingabe – Kontext für die Analyse. */
  spokenProductName?: string
  spokenTranscript?: string
  sourceType?: ProductLearnSourceType
  imageBase64?: string
  images?: ProductAssistantImageInput[]
  mimeType?: string
  sourceUrl?: string
  pdfBase64?: string
  pdfMimeType?: string
}

export interface ProductAssistantSubmitRequest {
  payload: Record<string, unknown>
  channel: ProductAssistantInputChannel
  sources?: Array<{
    sourceType: string
    sourceName: string
    sourceUrl?: string | null
    retrievedAt: string
    evidence?: string | null
  }>
  aiFieldConfidence?: Record<string, number>
}

export interface ProductAssistantSubmitResponse {
  submissionId: string
  status: string
  message: string
}
