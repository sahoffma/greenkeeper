import type { ProductRecognizeResult } from '../types/productRecognize'
import type {
  FertilizerRecognitionCandidate,
  FertilizerRecognitionCandidateField,
  FertilizerRecognitionIdentityOrigin,
} from '../types/fertilizerRecognitionCandidate'
import type { FertilizerProductStockStatus } from '../types/fertilizerInventory'
import {
  applyInitialStockAnswer,
  INITIAL_STOCK_PREVIOUS_REMAINDER_QUESTION,
  INITIAL_STOCK_REMAINDER_AMOUNT_QUESTION,
  planInitialStockQuestion,
  type InitialStockQuestion,
} from './productRecognizeStockCore'
import {
  formatNpkDeclarationDisplay,
  formatProductDescriptorDisplay,
  formatRecognitionProvenanceDisplay,
} from './fertilizerProductDisplay'
import { createRandomId } from './randomId'

export const RECOGNITION_CLIENT_TIMEOUT_MS = 30_000
export const RECOGNITION_SLOW_HINT_MS = 12_000

export const RECOGNITION_UI_PROGRESS_STEPS = [
  'Verpackung wird gelesen',
  'Produkt wird gesucht',
  'Produktinformationen werden geprüft',
] as const

export const RECOGNITION_SLOW_HINT_MESSAGE =
  'Die Produktsuche dauert gerade etwas länger.'

export const RECOGNITION_ERROR_FALLBACK_MESSAGE =
  'Die automatische Erkennung ist gerade nicht verfügbar. Du kannst das Produkt suchen oder das Foto erneut versuchen.'

export const RECOGNITION_PRIVACY_HINT =
  'Das Foto wird zur Produkterkennung verarbeitet und nicht dauerhaft gespeichert.'

function fieldFromEvidence(
  raw: { normalizedValue: string | null; source: FertilizerRecognitionCandidateField['source']; evidence: string | null; sourceUrl?: string | null },
): FertilizerRecognitionCandidateField | null {
  if (!raw.normalizedValue) {
    return null
  }

  return {
    value: raw.normalizedValue,
    source: raw.source,
    evidence: raw.evidence,
    sourceUrl: raw.sourceUrl ?? null,
  }
}

export function resolveIdentityOrigin(result: ProductRecognizeResult): FertilizerRecognitionIdentityOrigin {
  if (result.catalogMatch.matched) {
    return 'greenkeeper_catalog'
  }

  const hasOfficial = result.sources.some((source) =>
    ['official_manufacturer', 'official_brand'].includes(source.type),
  )

  if (hasOfficial) {
    return 'official_product_source'
  }

  return 'packaging_photo'
}

export function buildRecognitionCandidateFromResult(
  result: ProductRecognizeResult,
  recognizedAt: string = new Date().toISOString(),
): FertilizerRecognitionCandidate | null {
  if (!result.stockCapture.allowed) {
    return null
  }

  if (result.catalogMatch.matched && result.catalogMatch.productId) {
    return null
  }

  const { recognition } = result
  const npkLabel = recognition.npk.rawLabel
  const npkValue =
    npkLabel ??
    (recognition.npk.nitrogen != null &&
    recognition.npk.phosphate != null &&
    recognition.npk.potash != null
      ? `${recognition.npk.nitrogen}-${recognition.npk.phosphate}-${recognition.npk.potash}`
      : null)

  return {
    id: createRandomId(),
    status: 'pending_review',
    catalogProductId: null,
    productProfileId: null,
    brand: fieldFromEvidence(recognition.brand),
    productLine: fieldFromEvidence(recognition.productLine),
    productName: fieldFromEvidence(recognition.productName),
    variant: fieldFromEvidence(recognition.variant),
    productDescriptor: fieldFromEvidence(recognition.productDescriptor),
    manufacturer: fieldFromEvidence(recognition.manufacturer),
    npk: npkValue
      ? {
          value: npkValue,
          source: recognition.npk.source,
          evidence: recognition.npk.evidence,
          sourceUrl: recognition.npk.sourceUrl ?? null,
        }
      : null,
    packageSizeValue: recognition.packageSize.normalizedValue,
    packageSizeUnit: recognition.packageSize.unit,
    productForm: recognition.form.normalizedValue,
    identityConfidence: result.identityConfidence,
    dataCompleteness: result.dataCompleteness,
    identityOrigin: resolveIdentityOrigin(result),
    sources: result.sources,
    recognizedAt,
    recognitionSnapshot: recognition,
  }
}

export interface RecognizedProductDisplay {
  title: string
  subtitle: string | null
  descriptor: string | null
  npk: string | null
  packageSize: string | null
  productForm: string | null
  provenanceSourceLabel: string
  provenanceStatusLabel: string | null
  provenanceLabel: string
  incompleteOptionalHint: string | null
}

export function formatRecognizedProductDisplay(
  result: ProductRecognizeResult,
): RecognizedProductDisplay {
  const { recognition } = result
  const brand = recognition.brand.normalizedValue
  const line = recognition.productLine.normalizedValue
  const name =
    recognition.productName.normalizedValue ?? recognition.variant.normalizedValue

  const titleParts = [brand, line, name].filter(Boolean)
  const title = titleParts.length > 0 ? titleParts.join(' · ') : 'Produkt erkannt'

  const npkRaw =
    recognition.npk.rawLabel ??
    (recognition.npk.nitrogen != null &&
    recognition.npk.phosphate != null &&
    recognition.npk.potash != null
      ? `${recognition.npk.nitrogen}-${recognition.npk.phosphate}-${recognition.npk.potash}`
      : null)
  const npk = formatNpkDeclarationDisplay(npkRaw)

  const packageSize =
    recognition.packageSize.normalizedValue != null
      ? `${recognition.packageSize.normalizedValue} ${recognition.packageSize.unit ?? 'kg'}`
      : null

  const formLabel =
    recognition.form.normalizedValue === 'granular'
      ? 'Granulat'
      : recognition.form.normalizedValue === 'liquid'
        ? 'Flüssig'
        : null

  const provenance = formatRecognitionProvenanceDisplay(result)

  return {
    title,
    subtitle: line && name ? `${line} — ${name}` : null,
    descriptor: formatProductDescriptorDisplay(recognition.productDescriptor.normalizedValue),
    npk,
    packageSize,
    productForm: formLabel,
    provenanceSourceLabel: provenance.sourceLabel,
    provenanceStatusLabel: provenance.statusLabel,
    provenanceLabel: provenance.combinedLabel,
    incompleteOptionalHint:
      result.dataCompleteness < 0.5
        ? 'Einige optionale Produktdaten fehlen noch — Du kannst trotzdem fortfahren.'
        : null,
  }
}

export function recognitionAllowsAcceptance(result: ProductRecognizeResult): boolean {
  return result.stockCapture.allowed && result.status === 'identified'
}

export function recognitionNeedsClarification(result: ProductRecognizeResult): boolean {
  return (
    result.status === 'needs_clarification' ||
    result.nextAction.type === 'request_back_photo' ||
    result.nextAction.type === 'ask_question'
  )
}

export function recognitionPurchaseAmount(result: ProductRecognizeResult): {
  amount: number
  unit: string
} | null {
  const value = result.recognition.packageSize.normalizedValue
  const unit = result.recognition.packageSize.unit

  if (value == null || value <= 0 || !unit) {
    return null
  }

  return { amount: value, unit }
}

export function planRecognitionStockTransition(input: {
  result: ProductRecognizeResult
  stockStatus: FertilizerProductStockStatus
  purchaseAmount?: number | null
  unit?: string
}): {
  kind: 'direct_stock' | 'remainder_question' | 'remainder_amount' | 'add_to_existing' | 'ask_package_count'
  purchaseAmount?: number
  unit?: string
  totalStock?: number
  question?: InitialStockQuestion
} {
  const recognizedPurchase = recognitionPurchaseAmount(input.result)
  const purchaseAmount = input.purchaseAmount ?? recognizedPurchase?.amount ?? null
  const unit = input.unit ?? recognizedPurchase?.unit ?? input.stockStatus.unit

  if (purchaseAmount == null || purchaseAmount <= 0 || !unit.trim()) {
    return { kind: 'direct_stock' }
  }

  const question = planInitialStockQuestion({
    stockStatus: input.stockStatus.status,
    existingStock: input.stockStatus.currentBalance,
    purchaseAmount,
    unit,
  })

  if (question.kind === 'none') {
    return {
      kind: 'add_to_existing',
      totalStock: question.totalStock,
      unit: question.unit,
      purchaseAmount,
    }
  }

  return {
    kind: 'remainder_question',
    purchaseAmount,
    unit,
    question,
  }
}

export function applyRecognitionRemainderAnswer(
  question: InitialStockQuestion,
  answer: { hadPreviousRemainder?: boolean; previousRemainderAmount?: number | null },
): { totalStock: number; unit: string } | { needsAmount: true; purchaseAmount: number; unit: string } | null {
  const result = applyInitialStockAnswer(question, answer)

  if ('kind' in result) {
    if (result.kind === 'ask_remainder_amount') {
      return {
        needsAmount: true,
        purchaseAmount: result.purchaseAmount,
        unit: result.unit,
      }
    }

    return null
  }

  return {
    totalStock: result.totalStock,
    unit: result.unit,
  }
}

export {
  INITIAL_STOCK_PREVIOUS_REMAINDER_QUESTION,
  INITIAL_STOCK_REMAINDER_AMOUNT_QUESTION,
}

export function buildRecognitionProductLabel(result: ProductRecognizeResult): string {
  const display = formatRecognizedProductDisplay(result)
  return display.title
}

export function catalogProductIdFromResult(result: ProductRecognizeResult): string | null {
  if (result.catalogMatch.matched && result.catalogMatch.productId) {
    return result.catalogMatch.productId
  }

  return null
}

export function assertNoCatalogPersist(result: ProductRecognizeResult): boolean {
  return result.stockCapture.persistToCatalog === false
}
