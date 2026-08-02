import { describe, expect, it } from 'vitest'
import {
  acceptRecognitionResult,
  applyPackageCount,
  applyStockRemainderAnswer,
  createInitialCaptureDraft,
  proceedToConfirm,
} from './fertilizerCaptureCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'
import {
  buildProductStockIntakeQuantityFromCaptureDraft,
  FertilizerProductStockIntakeFromCaptureError,
} from './fertilizerProductStockIntakeFromCaptureCore'

function mockRecognitionResult(): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 1,
    dataCompleteness: 0.9,
    recognition: recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Frühjahr',
      variant: null,
      productDescriptor: null,
      manufacturer: null,
      npkLabel: '14-28-10',
      nitrogen: 14,
      phosphate: 28,
      potash: 10,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      form: 'granular',
      gtin: null,
      textFragments: [],
      fieldConfidence: { brand: 0.95, productLine: 0.9, productName: 0.92, npk: 0.93, packageSize: 0.9 },
    }),
    catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
    sources: [],
    missingRequiredFields: [],
    nextAction: { type: 'none', message: null },
    stockCapture: { allowed: true, recognitionCandidate: true, persistToCatalog: false, message: null },
    diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: [] },
    steps: [],
    spike: true,
  } as ProductRecognizeResult
}

function readyDraft() {
  let draft = createInitialCaptureDraft()
  draft = acceptRecognitionResult(draft, mockRecognitionResult(), {
    stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
  })
  draft = applyStockRemainderAnswer(draft, false)
  return proceedToConfirm(draft)
}

describe('fertilizerProductStockIntakeFromCaptureCore', () => {
  it('sums one package into a single intake quantity', () => {
    const result = buildProductStockIntakeQuantityFromCaptureDraft(readyDraft())
    expect(result).toEqual({ quantity: 25, baseUnit: 'kg', packageCount: 1 })
  })

  it('sums multiple packages into one intake quantity', () => {
    let draft = readyDraft()
    draft = applyPackageCount(draft, 2)
    draft = proceedToConfirm(draft)

    const result = buildProductStockIntakeQuantityFromCaptureDraft(draft)
    expect(result.quantity).toBe(50)
    expect(result.baseUnit).toBe('kg')
    expect(result.packageCount).toBe(2)
  })

  it('includes remainder in the total intake quantity', () => {
    let draft = readyDraft()
    draft = applyStockRemainderAnswer(draft, true)
    draft.previousRemainder = 3
    draft = applyPackageCount(draft, 2)
    draft = proceedToConfirm(draft)

    const result = buildProductStockIntakeQuantityFromCaptureDraft(draft)
    expect(result.quantity).toBe(28)
  })

  it('rejects null or negative totals', () => {
    const draft = readyDraft()
    draft.selectedPackageQuantity = null
    draft.quantity = 0
    draft.packageCount = 1

    expect(() => buildProductStockIntakeQuantityFromCaptureDraft(draft)).toThrow(
      FertilizerProductStockIntakeFromCaptureError,
    )
  })

  it('rejects gram units without kg conversion', () => {
    const draft = readyDraft()
    draft.selectedPackageUnit = null
    draft.unit = 'g'

    expect(() => buildProductStockIntakeQuantityFromCaptureDraft(draft)).toThrow(
      /kg an/,
    )
  })

  it('does not derive identity from product label or package size alone', () => {
    const result = buildProductStockIntakeQuantityFromCaptureDraft(readyDraft())
    expect(result.quantity).toBe(25)
    expect(result).not.toHaveProperty('savedProductProfileId')
  })
})
