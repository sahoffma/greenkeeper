import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FERTILIZER_CAPTURE_FIXTURE_PRODUCTS } from '../data/fertilizerCaptureFixtures'
import {
  acceptRecognitionResult,
  createInitialCaptureDraft,
  proceedToConfirm,
  selectFixtureProduct,
  updateStockQuantity,
} from './fertilizerCaptureCore'
import {
  buildFertilizerCaptureSavedReceipt,
  buildFertilizerCaptureSessionDraft,
  createCaptureDraftFromSavedReceipt,
  createInitialCaptureUiState,
  createInitialPhotoRecognitionSession,
  FERTILIZER_CAPTURE_DRAFT_MAX_AGE_MS,
  isEditableCaptureDraft,
  normalizeRestoredCaptureUi,
  parseFertilizerCaptureSavedReceipt,
  parseFertilizerCaptureSession,
  resolvePersistedCaptureBootstrap,
  resolveInterruptedPhotoRecognition,
  serializeFertilizerCaptureSavedReceipt,
  serializeFertilizerCaptureSession,
  shouldRestoreFertilizerCaptureSession,
} from './fertilizerCaptureSessionCore'
import {
  clearFertilizerCaptureSavedReceipt,
  clearFertilizerCaptureSession,
  loadFertilizerCaptureSavedReceipt,
  loadFertilizerCaptureSession,
  persistFertilizerCaptureSavedReceipt,
  persistFertilizerCaptureSession,
} from './fertilizerCaptureSession'
import {
  cancelRecognitionFlight,
  getActiveRecognitionFlight,
  resetRecognitionFlightsForTests,
  startRecognitionFlight,
} from './fertilizerRecognitionFlight'
import type { ProductRecognizeResult } from '../types/productRecognize'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'

const rasendoktorImage = {
  brand: 'Rasendoktor',
  productLine: 'Professional',
  productName: 'Frühjahr & Neuansaat',
  variant: null,
  productDescriptor: 'Rasendünger für Frühjahr und Neuansaat',
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

function mockRecognitionResult(): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 0.95,
    dataCompleteness: 0.4,
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

function mockSavedReceipt(overrides?: { userId?: string | null }) {
  return buildFertilizerCaptureSavedReceipt({
    userId: overrides?.userId ?? 'user-1',
    idempotencyKey: 'idem-1',
    saveResult: mockSaveResult(),
    savedAt: Date.now(),
  })
}

describe('fertilizerCaptureSessionCore', () => {
  it('round-trips capture draft with fixture product reference', () => {
    const product = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS[0]!
    const captureDraft = selectFixtureProduct(createInitialCaptureDraft(), product)
    const ui = createInitialCaptureUiState(captureDraft)
    ui.quantityInput = '7'
    ui.query = 'Classic'

    const session = buildFertilizerCaptureSessionDraft({
      userId: 'user-1',
      captureDraft,
      ui,
      updatedAt: Date.now(),
    })

    const restored = parseFertilizerCaptureSession(serializeFertilizerCaptureSession(session))

    expect(restored?.captureDraft.selectedProduct?.id).toBe(product.id)
    expect(restored?.ui.query).toBe('Classic')
    expect(restored?.ui.quantityInput).toBe('7')
  })

  it('keeps recognized product after serialize and restore', () => {
    const result = mockRecognitionResult()
    const captureDraft = acceptRecognitionResult(createInitialCaptureDraft(), result, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })
    const ui = createInitialCaptureUiState(captureDraft)
    ui.photoRecognitionOpen = true
    ui.photoRecognition = {
      ...createInitialPhotoRecognitionSession(),
      phase: 'result',
      result,
    }

    const session = buildFertilizerCaptureSessionDraft({
      userId: 'user-1',
      captureDraft,
      ui,
    })

    const restored = parseFertilizerCaptureSession(serializeFertilizerCaptureSession(session))

    expect(restored?.ui.photoRecognition?.phase).toBe('result')
    expect(restored?.ui.photoRecognition?.result?.recognition.brand.normalizedValue).toBe(
      'Rasendoktor',
    )
  })

  it('preserves quantity and unit in ui state', () => {
    const captureDraft = proceedToConfirm(
      updateStockQuantity(createInitialCaptureDraft(), 3.5, 'kg'),
    )
    const ui = createInitialCaptureUiState(captureDraft)
    ui.quantityInput = '3,5'
    ui.unit = 'kg'

    const session = buildFertilizerCaptureSessionDraft({
      userId: 'user-1',
      captureDraft,
      ui,
    })

    const restored = parseFertilizerCaptureSession(serializeFertilizerCaptureSession(session))

    expect(restored?.ui.quantityInput).toBe('3,5')
    expect(restored?.ui.unit).toBe('kg')
  })

  it('rejects stale drafts', () => {
    const session = buildFertilizerCaptureSessionDraft({
      userId: 'user-1',
      captureDraft: createInitialCaptureDraft(),
      ui: createInitialCaptureUiState(createInitialCaptureDraft()),
      updatedAt: Date.now() - FERTILIZER_CAPTURE_DRAFT_MAX_AGE_MS - 1,
    })

    expect(
      shouldRestoreFertilizerCaptureSession({
        draft: session,
        userId: 'user-1',
      }),
    ).toBe(false)
  })

  it('rejects drafts for a different user', () => {
    const session = buildFertilizerCaptureSessionDraft({
      userId: 'user-a',
      captureDraft: createInitialCaptureDraft(),
      ui: createInitialCaptureUiState(createInitialCaptureDraft()),
    })

    expect(
      shouldRestoreFertilizerCaptureSession({
        draft: session,
        userId: 'user-b',
      }),
    ).toBe(false)
  })

  it('keeps successful recognition when image is missing after restore', () => {
    const result = mockRecognitionResult()
    const normalized = normalizeRestoredCaptureUi({
      photoRecognitionOpen: true,
      photoRecognition: {
        phase: 'result',
        result,
        errorMessage: null,
        progressIndex: 0,
        slowHint: false,
        inFlightRequestId: null,
        imageMeta: null,
      },
      query: '',
      quantityInput: '',
      unit: 'kg',
      clarifyAnswer: '',
      remainderAmountInput: '',
      packageCountInput: '1',
      optionalOpen: false,
      notice: null,
      navigationStack: [],
    })

    expect(normalized.photoRecognition?.phase).toBe('result')
    expect(normalized.photoRecognition?.result).not.toBeNull()
  })

  it('resets interrupted analyzing state without a persisted result', () => {
    const next = resolveInterruptedPhotoRecognition({
      ...createInitialPhotoRecognitionSession(),
      phase: 'analyzing',
      inFlightRequestId: 'req-1',
      imageMeta: { fileName: 'pack.jpg', mimeType: 'image/jpeg', lastModified: 1 },
    })

    expect(next.phase).toBe('select')
    expect(next.inFlightRequestId).toBeNull()
  })

  it('prefers saved receipt over editable draft on restore', () => {
    const receipt = buildFertilizerCaptureSavedReceipt({
      userId: 'user-1',
      idempotencyKey: 'idem-1',
      saveResult: mockSaveResult(),
    })
    const session = buildFertilizerCaptureSessionDraft({
      userId: 'user-1',
      captureDraft: createInitialCaptureDraft(),
      ui: createInitialCaptureUiState(createInitialCaptureDraft()),
    })

    const restored = resolvePersistedCaptureBootstrap({
      storedReceipt: receipt,
      storedSession: session,
    })

    expect(restored?.captureDraft.step).toBe('saved')
    expect(restored?.captureDraft.saveResult?.productLabel).toBe(
      'Rasendoktor · Professional · Frühjahr & Neuansaat',
    )
  })

  it('rejects editable session drafts in saved step', () => {
    const session = buildFertilizerCaptureSessionDraft({
      userId: 'user-1',
      captureDraft: {
        ...createInitialCaptureDraft(),
        step: 'saved',
        saveResult: mockSaveResult(),
      },
      ui: createInitialCaptureUiState(createInitialCaptureDraft()),
    })

    expect(
      shouldRestoreFertilizerCaptureSession({
        draft: session,
        userId: 'user-1',
      }),
    ).toBe(false)
  })

  it('marks saved capture drafts as non-editable', () => {
    expect(isEditableCaptureDraft(createInitialCaptureDraft())).toBe(true)
    expect(
      isEditableCaptureDraft(createCaptureDraftFromSavedReceipt(mockSavedReceipt())),
    ).toBe(false)
  })
})

describe('fertilizerCaptureSession storage', () => {
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

  it('loads a persisted draft for the same user', () => {
    const captureDraft = createInitialCaptureDraft()
    const ui = createInitialCaptureUiState(captureDraft)
    ui.quantityInput = '2'

    persistFertilizerCaptureSession({
      userId: 'user-1',
      captureDraft,
      ui,
    })

    const restored = loadFertilizerCaptureSession('user-1')

    expect(restored?.ui.quantityInput).toBe('2')
  })

  it('clears draft on explicit clear', () => {
    persistFertilizerCaptureSession({
      userId: 'user-1',
      captureDraft: createInitialCaptureDraft(),
      ui: createInitialCaptureUiState(createInitialCaptureDraft()),
    })

    clearFertilizerCaptureSession('user-1')

    expect(loadFertilizerCaptureSession('user-1')).toBeNull()
  })

  it('persists and restores saved receipt for the same user', () => {
    const receipt = mockSavedReceipt()

    persistFertilizerCaptureSavedReceipt({
      userId: 'user-1',
      receipt,
    })

    const restored = loadFertilizerCaptureSavedReceipt('user-1')

    expect(restored?.saveResult.resultingBalance).toBe(5)
    expect(restored?.idempotencyKey).toBe('idem-1')
  })

  it('clears saved receipt on explicit clear', () => {
    persistFertilizerCaptureSavedReceipt({
      userId: 'user-1',
      receipt: mockSavedReceipt(),
    })

    clearFertilizerCaptureSavedReceipt('user-1')

    expect(loadFertilizerCaptureSavedReceipt('user-1')).toBeNull()
  })

  it('rejects stale saved receipts', () => {
    const receipt = buildFertilizerCaptureSavedReceipt({
      userId: 'user-1',
      idempotencyKey: 'idem-1',
      saveResult: mockSaveResult(),
      savedAt: Date.now() - FERTILIZER_CAPTURE_DRAFT_MAX_AGE_MS - 1,
      updatedAt: Date.now() - FERTILIZER_CAPTURE_DRAFT_MAX_AGE_MS - 1,
    })

    persistFertilizerCaptureSavedReceipt({
      userId: 'user-1',
      receipt,
    })

    expect(loadFertilizerCaptureSavedReceipt('user-1')).toBeNull()
  })

  it('rejects saved receipts for a different user', () => {
    persistFertilizerCaptureSavedReceipt({
      userId: 'user-a',
      receipt: mockSavedReceipt({ userId: 'user-a' }),
    })

    expect(loadFertilizerCaptureSavedReceipt('user-b')).toBeNull()
  })

  it('does not restore editable draft after save receipt is persisted', () => {
    persistFertilizerCaptureSession({
      userId: 'user-1',
      captureDraft: proceedToConfirm(createInitialCaptureDraft()),
      ui: createInitialCaptureUiState(createInitialCaptureDraft()),
    })

    persistFertilizerCaptureSavedReceipt({
      userId: 'user-1',
      receipt: mockSavedReceipt(),
    })
    clearFertilizerCaptureSession('user-1')

    expect(loadFertilizerCaptureSession('user-1')).toBeNull()
    expect(loadFertilizerCaptureSavedReceipt('user-1')?.saveResult.resultingBalance).toBe(5)
  })

  it('round-trips saved receipt serialization', () => {
    const receipt = mockSavedReceipt()
    const restored = parseFertilizerCaptureSavedReceipt(
      serializeFertilizerCaptureSavedReceipt(receipt),
    )

    expect(restored?.saveResult.purchaseQuantity).toBe(5)
    expect(restored?.savedAt).toBe(receipt.savedAt)
  })
})

describe('fertilizerRecognitionFlight', () => {
  beforeEach(() => {
    resetRecognitionFlightsForTests()
  })

  it('reuses an in-flight request for the same request id', async () => {
    const run = vi.fn(async () => mockRecognitionResult())

    const first = startRecognitionFlight('req-1', run)
    const second = startRecognitionFlight('req-1', run)

    expect(run).toHaveBeenCalledTimes(1)
    await expect(first).resolves.toBe(await second)
  })

  it('returns the active flight promise after remount-style reattach', async () => {
    let resolve!: (value: ProductRecognizeResult) => void
    const pending = new Promise<ProductRecognizeResult>((res) => {
      resolve = res
    })

    void startRecognitionFlight('req-2', async () => pending)

    const reattached = getActiveRecognitionFlight('req-2')
    expect(reattached).not.toBeNull()

    resolve(mockRecognitionResult())
    await expect(reattached).resolves.toMatchObject({ status: 'identified' })
  })

  it('cancels only the matching in-flight request', async () => {
    const run = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<ProductRecognizeResult>(() => {
          /* pending */
        }),
    )

    startRecognitionFlight('req-3', run)
    cancelRecognitionFlight('req-3')

    expect(getActiveRecognitionFlight('req-3')).toBeNull()
  })
})
