import type { FertilizerRecognitionCandidate } from '../types/fertilizerRecognitionCandidate'
import type {
  FertilizerCaptureInventorySaveResult,
  FertilizerProductStockStatus,
  FertilizerRecognitionCandidatePayload,
} from '../types/fertilizerInventory'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'
import type { ProductRecognizeResult } from '../types/productRecognize'
import {
  buildRecognitionProductLabel,
  catalogProductIdFromResult,
  recognitionPurchaseAmount,
} from './fertilizerRecognitionCore'
import {
  planInitialStockQuestion,
  type InitialStockQuestion,
} from './productRecognizeStockCore'

export const FERTILIZER_MAX_QUANTITY = 100_000

export function normalizeFingerprintPart(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildRecognitionIdentityFingerprint(input: {
  brand?: string | null
  productLine?: string | null
  productName?: string | null
  variant?: string | null
  npk?: string | null
}): string | null {
  const parts = [
    normalizeFingerprintPart(input.brand),
    normalizeFingerprintPart(input.productLine),
    normalizeFingerprintPart(input.productName),
    normalizeFingerprintPart(input.variant),
    normalizeFingerprintPart(input.npk),
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('|') : null
}

export function fingerprintFromRecognitionResult(result: ProductRecognizeResult): string | null {
  const { recognition } = result
  const npk =
    recognition.npk.rawLabel ??
    (recognition.npk.nitrogen != null &&
    recognition.npk.phosphate != null &&
    recognition.npk.potash != null
      ? `${recognition.npk.nitrogen}-${recognition.npk.phosphate}-${recognition.npk.potash}`
      : null)

  return buildRecognitionIdentityFingerprint({
    brand: recognition.brand.normalizedValue,
    productLine: recognition.productLine.normalizedValue,
    productName: recognition.productName.normalizedValue,
    variant: recognition.variant.normalizedValue,
    npk,
  })
}

export function fingerprintFromCandidate(
  candidate: FertilizerRecognitionCandidate,
): string | null {
  return buildRecognitionIdentityFingerprint({
    brand: candidate.brand?.value != null ? String(candidate.brand.value) : null,
    productLine: candidate.productLine?.value != null ? String(candidate.productLine.value) : null,
    productName: candidate.productName?.value != null ? String(candidate.productName.value) : null,
    variant: candidate.variant?.value != null ? String(candidate.variant.value) : null,
    npk: candidate.npk?.value != null ? String(candidate.npk.value) : null,
  })
}

export function parseStockStatusPayload(payload: unknown): FertilizerProductStockStatus {
  const record = payload as Record<string, unknown>
  const status = record.status

  if (status !== 'has_stock' && status !== 'known_zero' && status !== 'first_time') {
    throw new Error('Ungültiger Bestandsstatus.')
  }

  return {
    status,
    currentBalance: typeof record.current_balance === 'number' ? record.current_balance : 0,
    unit: typeof record.unit === 'string' && record.unit.trim() ? record.unit : 'kg',
  }
}

export function planCaptureStockQuestion(input: {
  stockStatus: FertilizerProductStockStatus
  purchaseAmount: number
  unit: string
}): InitialStockQuestion {
  return planInitialStockQuestion({
    stockStatus: input.stockStatus.status,
    existingStock: input.stockStatus.currentBalance,
    purchaseAmount: input.purchaseAmount,
    unit: input.unit,
  })
}

export function computePurchaseAmount(input: {
  packageSize: number | null
  packageCount: number | null
  explicitQuantity: number | null
}): number | null {
  if (input.explicitQuantity != null && input.explicitQuantity > 0) {
    return input.explicitQuantity
  }

  if (input.packageSize != null && input.packageSize > 0) {
    const count = input.packageCount ?? 1
    if (count > 0) {
      return input.packageSize * count
    }
  }

  return null
}

export function needsPackageCountQuestion(draft: FertilizerCaptureDraft): boolean {
  return (
    draft.selectedPackageQuantity != null &&
    draft.selectedPackageQuantity > 0 &&
    draft.packageCount == null &&
    draft.purchaseQuantity == null
  )
}

export function validateCaptureQuantity(value: number | null): string | null {
  if (value == null || Number.isNaN(value)) {
    return 'Bitte gib eine gültige Menge ein.'
  }

  if (value <= 0) {
    return 'Die Menge muss größer als null sein.'
  }

  if (value > FERTILIZER_MAX_QUANTITY) {
    return 'Die Menge ist zu groß.'
  }

  if (!Number.isFinite(value)) {
    return 'Die Menge ist ungültig.'
  }

  return null
}

export function buildCandidatePayloadForSave(
  candidate: FertilizerRecognitionCandidate,
): FertilizerRecognitionCandidatePayload {
  return {
    brand: candidate.brand?.value != null ? String(candidate.brand.value) : null,
    productLine: candidate.productLine?.value != null ? String(candidate.productLine.value) : null,
    productName: candidate.productName?.value != null ? String(candidate.productName.value) : null,
    variant: candidate.variant?.value != null ? String(candidate.variant.value) : null,
    productDescriptor:
      candidate.productDescriptor?.value != null ? String(candidate.productDescriptor.value) : null,
    manufacturer: candidate.manufacturer?.value != null ? String(candidate.manufacturer.value) : null,
    npk: candidate.npk?.value != null ? String(candidate.npk.value) : null,
    packageSizeValue: candidate.packageSizeValue,
    packageSizeUnit: candidate.packageSizeUnit,
    productForm: candidate.productForm,
    identityConfidence: candidate.identityConfidence,
    dataCompleteness: candidate.dataCompleteness,
    identityOrigin: candidate.identityOrigin,
    recognitionSnapshot: candidate.recognitionSnapshot,
    status: candidate.status,
  }
}

export function buildSavePayloadFromDraft(draft: FertilizerCaptureDraft): {
  idempotencyKey: string
  catalogProductId: string | null
  candidate: FertilizerRecognitionCandidatePayload | null
  purchaseQuantity: number
  purchaseUnit: string
  previousRemainder: number | null
  packageCount: number
  productLabel: string
} {
  if (!draft.idempotencyKey) {
    throw new Error('Idempotenzschlüssel fehlt.')
  }

  const purchaseQuantity = draft.purchaseQuantity ?? draft.quantity

  if (purchaseQuantity == null) {
    throw new Error('Kaufmenge fehlt.')
  }

  const validationError = validateCaptureQuantity(purchaseQuantity)
  if (validationError) {
    throw new Error(validationError)
  }

  const productLabel =
    draft.customProductLabel ??
    (draft.recognitionResult ? buildRecognitionProductLabel(draft.recognitionResult) : 'Dünger')

  return {
    idempotencyKey: draft.idempotencyKey,
    catalogProductId: draft.catalogProductId,
    candidate: draft.recognitionCandidate
      ? buildCandidatePayloadForSave(draft.recognitionCandidate)
      : null,
    purchaseQuantity,
    purchaseUnit: draft.unit,
    previousRemainder: draft.previousRemainder,
    packageCount: draft.packageCount ?? 1,
    productLabel,
  }
}

export function resolveProductReferenceFromDraft(draft: FertilizerCaptureDraft): {
  catalogProductId: string | null
  identityFingerprint: string | null
  unit: string
} {
  if (draft.catalogProductId) {
    return {
      catalogProductId: draft.catalogProductId,
      identityFingerprint: null,
      unit: draft.unit,
    }
  }

  if (draft.recognitionResult) {
    return {
      catalogProductId: catalogProductIdFromResult(draft.recognitionResult),
      identityFingerprint: fingerprintFromRecognitionResult(draft.recognitionResult),
      unit: draft.unit,
    }
  }

  if (draft.recognitionCandidate) {
    return {
      catalogProductId: null,
      identityFingerprint: fingerprintFromCandidate(draft.recognitionCandidate),
      unit: draft.unit,
    }
  }

  return {
    catalogProductId: null,
    identityFingerprint: null,
    unit: draft.unit,
  }
}

export function purchaseAmountFromRecognition(result: ProductRecognizeResult): {
  amount: number | null
  unit: string
  packageSize: number | null
} {
  const purchase = recognitionPurchaseAmount(result)
  const packageSize = result.recognition.packageSize.normalizedValue
  const unit = result.recognition.packageSize.unit ?? 'kg'

  return {
    amount: purchase?.amount ?? null,
    unit: purchase?.unit ?? unit,
    packageSize,
  }
}

export function formatSaveConfirmationLines(result: {
  purchaseQuantity: number
  purchaseUnit: string
  previousRemainder: number | null
  resultingBalance: number
}): { purchaseLine: string; remainderLine: string | null; balanceLine: string } {
  const unit = result.purchaseUnit
  const purchaseLine = `Kauf: ${formatQty(result.purchaseQuantity)} ${unit}`
  const remainderLine =
    result.previousRemainder != null && result.previousRemainder > 0
      ? `Vorheriger Restbestand: ${formatQty(result.previousRemainder)} ${unit}`
      : null
  const balanceLine = `Neuer Bestand: ${formatQty(result.resultingBalance)} ${unit}`

  return { purchaseLine, remainderLine, balanceLine }
}

export function formatInventorySaveConfirmationLines(result: FertilizerCaptureInventorySaveResult): {
  packageLine: string
  quantityLine: string
  reasonLine: string
} {
  const packageLabel = result.packageCount === 1 ? 'Packung' : 'Packungen'
  return {
    packageLine: `${result.packageCount} ${packageLabel} erfasst`,
    quantityLine: `${formatQty(result.totalInitialQuantity)} ${result.baseUnit} aufgenommen`,
    reasonLine:
      result.creationReason === 'initial_stock'
        ? 'Grund: Bereits vorhanden'
        : result.creationReason === 'purchase'
          ? 'Grund: Gekauft'
          : 'Grund: Geschenkt erhalten',
  }
}

function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('de-DE', { maximumFractionDigits: 4 })
}
