import type {
  ProductRecognizeFieldSource,
  ProductRecognizeFormValue,
  ProductRecognizeRecognition,
  ProductRecognizeSourceRecord,
} from './productRecognize'

export type FertilizerRecognitionCandidateStatus = 'pending_review' | 'accepted'

export type FertilizerRecognitionIdentityOrigin =
  | 'greenkeeper_catalog'
  | 'official_product_source'
  | 'packaging_photo'

export interface FertilizerRecognitionCandidateField {
  value: string | number | null
  source: ProductRecognizeFieldSource
  evidence: string | null
  sourceUrl?: string | null
}

export interface FertilizerRecognitionCandidate {
  /** Persönlicher, nicht verifizierter Kandidat — kein Katalog-Write. */
  id: string
  status: FertilizerRecognitionCandidateStatus
  /** Bei eindeutigem Katalogtreffer: bestehendes Produkt verwenden, kein paralleler Candidate. */
  catalogProductId: string | null
  /** Verweis auf fachliches Product Profile (GA-013). */
  productProfileId: string | null
  brand: FertilizerRecognitionCandidateField | null
  productLine: FertilizerRecognitionCandidateField | null
  productName: FertilizerRecognitionCandidateField | null
  variant: FertilizerRecognitionCandidateField | null
  productDescriptor: FertilizerRecognitionCandidateField | null
  manufacturer: FertilizerRecognitionCandidateField | null
  npk: FertilizerRecognitionCandidateField | null
  packageSizeValue: number | null
  packageSizeUnit: string | null
  productForm: ProductRecognizeFormValue
  identityConfidence: number
  dataCompleteness: number
  identityOrigin: FertilizerRecognitionIdentityOrigin
  sources: ProductRecognizeSourceRecord[]
  recognizedAt: string
  /** Rohdaten für spätere Governance-Submission — nicht in UI anzeigen. */
  recognitionSnapshot: ProductRecognizeRecognition
}
