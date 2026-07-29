import { describe, expect, it } from 'vitest'
import { FERTILIZER_CAPTURE_FIXTURE_PRODUCTS } from '../data/fertilizerCaptureFixtures'
import {
  acceptRecognitionResult,
  applyPackageClarification,
  applyStockRemainderAnswer,
  createInitialCaptureDraft,
  proceedToConfirm,
  selectFixtureProduct,
} from './fertilizerCaptureCore'
import {
  createCaptureNavigationSnapshot,
  fallbackCaptureStepBack,
  popCaptureNavigationStack,
  shouldExitCaptureFlowOnBack,
} from './fertilizerCaptureNavigationCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'

const rasendoktorImage = {
  brand: 'Rasendoktor',
  productLine: 'Professional',
  productName: 'Frühjahr & Neuansaat',
  variant: null,
  productDescriptor: null,
  manufacturer: null,
  npkLabel: '14-28-10',
  nitrogen: 14,
  phosphate: 28,
  potash: 10,
  packageSizeValue: 5,
  packageSizeUnit: 'kg',
  form: 'granular' as const,
  gtin: null,
  textFragments: [],
  fieldConfidence: { brand: 0.95, productLine: 0.9, productName: 0.92, npk: 0.93, packageSize: 0.9 },
}

function mockResult(): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 1,
    dataCompleteness: 0.2,
    recognition: recognitionFromImageAnalysis(rasendoktorImage),
    catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
    sources: [],
    missingRequiredFields: [],
    nextAction: { type: 'none', message: null },
    stockCapture: {
      allowed: true,
      recognitionCandidate: true,
      persistToCatalog: false,
      message: null,
    },
    diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: [] },
    steps: [],
    spike: true,
  } as ProductRecognizeResult
}

describe('fertilizerCaptureNavigationCore', () => {
  it('exits only from find when navigation stack is empty', () => {
    expect(
      shouldExitCaptureFlowOnBack({
        captureStep: 'find',
        photoRecognitionOpen: false,
        navigationStackLength: 0,
      }),
    ).toBe(true)

    expect(
      shouldExitCaptureFlowOnBack({
        captureStep: 'confirm',
        photoRecognitionOpen: false,
        navigationStackLength: 0,
      }),
    ).toBe(false)
  })

  it('does not exit while photo recognition overlay is open', () => {
    expect(
      shouldExitCaptureFlowOnBack({
        captureStep: 'find',
        photoRecognitionOpen: true,
        navigationStackLength: 0,
      }),
    ).toBe(false)
  })

  it('restores previous snapshot from navigation stack', () => {
    const before = createCaptureNavigationSnapshot({
      captureDraft: { ...createInitialCaptureDraft(), step: 'stock-remainder' },
      photoRecognitionOpen: false,
      photoRecognition: null,
      query: '',
      quantityInput: '',
      unit: 'kg',
      clarifyAnswer: '',
      remainderAmountInput: '',
      packageCountInput: '1',
      optionalOpen: false,
      notice: null,
    })

    const { snapshot, remaining } = popCaptureNavigationStack([before])

    expect(snapshot?.captureDraft.step).toBe('stock-remainder')
    expect(remaining).toHaveLength(0)
  })

  it('falls back from confirm to stock-remainder after answering no', () => {
    let draft = acceptRecognitionResult(createInitialCaptureDraft(), mockResult(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    draft = applyStockRemainderAnswer(draft, false)
    expect(draft.step).toBe('confirm')

    const previous = fallbackCaptureStepBack(draft)
    expect(previous?.step).toBe('stock-remainder')
    expect(previous?.quantity).toBeNull()
  })

  it('falls back from confirm to clarify-package after package clarification', () => {
    const product = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS[1]!
    const draft = proceedToConfirm(
      applyPackageClarification(
        selectFixtureProduct(createInitialCaptureDraft(), product),
        '7 kg',
      ).draft,
    )

    const previous = fallbackCaptureStepBack(draft)
    expect(previous?.step).toBe('clarify-package')
  })
})
