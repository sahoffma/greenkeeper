export type FertilizerMovementType =
  | 'purchase'
  | 'initial_stock'
  | 'gift_received'
  | 'sale'
  | 'gifted_away'
  | 'disposal'
  | 'fertilization'
  | 'inventory_correction'

export type FertilizerMovementOrigin = 'manual' | 'journal' | 'system' | 'migration'

export type FertilizerProductStockStatusKind = 'has_stock' | 'known_zero' | 'first_time'

export interface FertilizerProductStockStatus {
  status: FertilizerProductStockStatusKind
  currentBalance: number
  unit: string
}

export interface FertilizerCaptureSaveResult {
  receiptId: string
  containerId: string
  catalogProductId: string | null
  recognitionCandidateId: string | null
  productProfileId: string | null
  productLabel: string
  purchaseQuantity: number
  purchaseUnit: string
  previousRemainder: number | null
  resultingBalance: number
  idempotentReplay: boolean
}

export interface FertilizerStockListItem {
  id: string
  productLabel: string
  balance: number
  unit: string
  catalogProductId: string | null
  recognitionCandidateId: string | null
  productForm: 'granular' | 'liquid' | 'unknown' | null
}

export interface FertilizerRecognitionCandidatePayload {
  brand: string | null
  productLine: string | null
  productName: string | null
  variant: string | null
  productDescriptor: string | null
  manufacturer: string | null
  npk: string | null
  packageSizeValue: number | null
  packageSizeUnit: string | null
  productForm: string
  identityConfidence: number | null
  dataCompleteness: number | null
  identityOrigin: string | null
  recognitionSnapshot: unknown
  status: string
}
