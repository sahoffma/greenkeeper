import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  acceptRecognitionResult,
  applyFreeQuantityEntry,
  createInitialCaptureDraft,
  proceedToConfirm,
} from './fertilizerCaptureCore'
import {
  advanceCaptureAfterRemainderNo,
  buildCaptureRemainderNavigationSnapshot,
  completeCaptureAfterSave,
  remountCaptureFlowAfterSave,
  resolveCaptureFlowBootstrap,
} from './fertilizerCaptureFlowActions'
import {
  clearFertilizerCaptureSavedReceipt,
  loadFertilizerCaptureSavedReceipt,
  loadFertilizerCaptureSession,
} from './fertilizerCaptureSession'
import { isEditableCaptureDraft } from './fertilizerCaptureSessionCore'
import {
  fallbackCaptureStepBack,
  popCaptureNavigationStack,
} from './fertilizerCaptureNavigationCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'

function mockRecognitionResult(overrides?: {
  form?: string
  packageSizeValue?: number | null
  catalogMatched?: boolean
  catalogProductId?: string
}): ProductRecognizeResult {
  const packageSizeValue = overrides?.packageSizeValue ?? 5

  return {
    status: 'identified',
    identityConfidence: 1,
    dataCompleteness: 0.2,
    recognition: recognitionFromImageAnalysis({
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
      packageSizeValue,
      packageSizeUnit: packageSizeValue != null ? 'kg' : null,
      form: (overrides?.form ?? 'granular') as 'granular',
      gtin: null,
      textFragments: [],
      fieldConfidence: { brand: 0.95, productLine: 0.9, productName: 0.92, npk: 0.93, packageSize: 0.9 },
    }),
    catalogMatch: {
      matched: overrides?.catalogMatched ?? false,
      productId: overrides?.catalogProductId ?? null,
      matchType: overrides?.catalogMatched ? 'exact' : 'none',
      confidence: overrides?.catalogMatched ? 1 : 0,
    },
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

function emptySnapshotFields() {
  return {
    photoRecognitionOpen: false,
    photoRecognition: null,
    query: '',
    quantityInput: '',
    unit: 'kg' as const,
    clarifyAnswer: '',
    remainderAmountInput: '',
    packageCountInput: '1',
    optionalOpen: false,
    notice: null,
  }
}

function mockSaveResult() {
  return {
    receiptId: 'receipt-1',
    containerId: 'container-1',
    catalogProductId: null,
    recognitionCandidateId: 'candidate-1',
    productProfileId: null,
    productLabel: 'Rasendoktor · Professional · Frühjahr & Neuansaat',
    purchaseQuantity: 5,
    purchaseUnit: 'kg',
    previousRemainder: 0,
    resultingBalance: 5,
    idempotentReplay: false,
  }
}

describe('fertilizerCaptureFlowActions', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    })
  })

  it('advances to confirm after remainder no click with navigation snapshot', () => {
    let draft = acceptRecognitionResult(createInitialCaptureDraft(), mockRecognitionResult(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    expect(draft.step).toBe('stock-remainder')

    const snapshot = buildCaptureRemainderNavigationSnapshot({
      draft,
      ...emptySnapshotFields(),
    })

    const advanced = advanceCaptureAfterRemainderNo({
      draft,
      navigationStack: [],
      snapshot,
    })

    expect(advanced.navigationStack).toHaveLength(1)
    expect(advanced.navigationStack[0]?.captureDraft.step).toBe('stock-remainder')
    expect(advanced.draft.step).toBe('confirm')
    expect(advanced.draft.quantity).toBe(5)
    expect(advanced.draft.previousRemainder).toBe(0)

    const previous = fallbackCaptureStepBack(advanced.draft)
    expect(previous?.step).toBe('stock-remainder')
    expect(previous?.quantity).toBeNull()

    const { snapshot: restored, remaining } = popCaptureNavigationStack(advanced.navigationStack)
    expect(restored?.captureDraft.step).toBe('stock-remainder')
    expect(remaining).toHaveLength(0)
  })

  it('advances to enter-quantity when purchase amount is not reliable', () => {
    let draft = acceptRecognitionResult(
      createInitialCaptureDraft(),
      mockRecognitionResult({ packageSizeValue: null }),
      {
        stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
      },
    )

    draft = {
      ...draft,
      step: 'stock-remainder',
      stockQuestion: {
        kind: 'ask_previous_remainder',
        purchaseAmount: 0,
        unit: 'kg',
      },
      purchaseQuantity: null,
      selectedPackageQuantity: null,
    }

    const advanced = advanceCaptureAfterRemainderNo({
      draft,
      navigationStack: [],
      snapshot: buildCaptureRemainderNavigationSnapshot({
        draft,
        ...emptySnapshotFields(),
      }),
    })

    expect(advanced.draft.step).toBe('enter-quantity')

    const confirmed = applyFreeQuantityEntry(advanced.draft, 3.5, 'kg')
    expect(confirmed.step).toBe('confirm')
    expect(confirmed.quantity).toBe(3.5)
  })

  it('persists saved receipt and restores saved step after remount', () => {
    let draft = acceptRecognitionResult(createInitialCaptureDraft(), mockRecognitionResult(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })
    draft = proceedToConfirm({ ...draft, quantity: 5, purchaseQuantity: 5, previousRemainder: 0 })

    expect(draft.step).toBe('confirm')

    const savedDraft = completeCaptureAfterSave({
      userId: 'user-1',
      idempotencyKey: 'idem-confirm-save',
      saveResult: mockSaveResult(),
    })

    expect(savedDraft.step).toBe('saved')
    expect(loadFertilizerCaptureSession('user-1')).toBeNull()
    expect(loadFertilizerCaptureSavedReceipt('user-1')?.saveResult).toMatchObject({
      resultingBalance: 5,
    })

    const remounted = remountCaptureFlowAfterSave({ userId: 'user-1' })

    expect(remounted?.step).toBe('saved')
    expect(remounted?.saveResult?.productLabel).toBe(
      'Rasendoktor · Professional · Frühjahr & Neuansaat',
    )
    expect(isEditableCaptureDraft(remounted!)).toBe(false)
  })

  it('does not expose editable draft after save completion', () => {
    completeCaptureAfterSave({
      userId: 'user-1',
      idempotencyKey: 'idem-no-resume',
      saveResult: mockSaveResult(),
    })

    const bootstrap = resolveCaptureFlowBootstrap({ userId: 'user-1' })

    expect(bootstrap?.captureDraft.step).toBe('saved')
    expect(loadFertilizerCaptureSession('user-1')).toBeNull()
  })

  it('clears saved receipt when user leaves to stock overview', () => {
    completeCaptureAfterSave({
      userId: 'user-1',
      idempotencyKey: 'idem-leave',
      saveResult: mockSaveResult(),
    })

    clearFertilizerCaptureSavedReceipt('user-1')

    expect(remountCaptureFlowAfterSave({ userId: 'user-1' })).toBeNull()
  })

  it('keeps idempotency key on restored saved draft to prevent duplicate saves in ui', () => {
    const savedDraft = completeCaptureAfterSave({
      userId: 'user-1',
      idempotencyKey: 'idem-once',
      saveResult: mockSaveResult(),
    })

    const remounted = remountCaptureFlowAfterSave({ userId: 'user-1' })

    expect(savedDraft.idempotencyKey).toBe('idem-once')
    expect(remounted?.idempotencyKey).toBe('idem-once')
    expect(remounted?.step).toBe('saved')
  })
})
