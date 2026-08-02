import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptRecognitionResult,
  applyStockRemainderAnswer,
  createInitialCaptureDraft,
  proceedToConfirm,
  setCreationReason,
} from './fertilizerCaptureCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'
import {
  FERTILIZER_CAPTURE_CREATION_REASON_OPTIONS,
  isFertilizerInventoryCreationReason,
  saveFertilizerCaptureToInventoryCore,
} from './fertilizerCaptureInventorySaveCore'

vi.mock('./fertilizerEnrichmentClient', () => ({
  startFertilizerEnrichmentFromCapture: vi.fn(),
}))

vi.mock('./fertilizerProductProfileSaveClient', () => ({
  saveFertilizerProductProfileFromCapture: vi.fn(),
}))

vi.mock('./fertilizerInventoryCreation', () => ({
  createFertilizerInventoryFromCapture: vi.fn(),
}))

import { startFertilizerEnrichmentFromCapture } from './fertilizerEnrichmentClient'
import { saveFertilizerProductProfileFromCapture } from './fertilizerProductProfileSaveClient'
import { createFertilizerInventoryFromCapture } from './fertilizerInventoryCreation'

const mockStartEnrichment = vi.mocked(startFertilizerEnrichmentFromCapture)
const mockSaveProfile = vi.mocked(saveFertilizerProductProfileFromCapture)
const mockCreateInventory = vi.mocked(createFertilizerInventoryFromCapture)

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
  draft = proceedToConfirm(draft)
  draft = setCreationReason(draft, 'purchase')
  return draft
}

describe('fertilizerCaptureInventorySaveCore', () => {
  beforeEach(() => {
    mockStartEnrichment.mockReset()
    mockSaveProfile.mockReset()
    mockCreateInventory.mockReset()
  })

  it('exposes exactly three creation reason options without inventory_correction', () => {
    expect(FERTILIZER_CAPTURE_CREATION_REASON_OPTIONS).toEqual([
      { value: 'initial_stock', label: 'Bereits vorhanden' },
      { value: 'purchase', label: 'Gekauft' },
      { value: 'gift_received', label: 'Geschenkt erhalten' },
    ])
    expect(isFertilizerInventoryCreationReason('inventory_correction')).toBe(false)
  })

  it('rejects save without a creation reason', async () => {
    const draft = readyDraft()
    draft.creationReason = null

    await expect(
      saveFertilizerCaptureToInventoryCore({
        draft,
        userId: 'user-1',
        creationReason: null as never,
      }),
    ).rejects.toMatchObject({ code: 'creation_reason_invalid' })
  })

  it('maps Bereits vorhanden to initial_stock', async () => {
    mockStartEnrichment.mockResolvedValue({
      jobId: 'job-1',
      result: {
        status: 'intake_ready',
        pipelineResult: { readinessResult: { status: 'ready' } },
      },
    } as never)
    mockSaveProfile.mockResolvedValue({ profile: { id: 'profile-1' } } as never)
    mockCreateInventory.mockResolvedValue({
      operationId: 'op-1',
      idempotencyKey: 'idem:inventory',
      packageCount: 1,
      totalInitialQuantity: 25,
      baseUnit: 'kg',
      packages: [{ item: { id: 'item-1' }, initialMovement: { quantityDelta: 25 } }],
    } as never)

    const draft = setCreationReason(readyDraft(), 'initial_stock')
    const result = await saveFertilizerCaptureToInventoryCore({
      draft,
      userId: 'user-1',
      creationReason: 'initial_stock',
    })

    expect(result.creationReason).toBe('initial_stock')
    expect(mockCreateInventory).toHaveBeenCalledWith(
      expect.objectContaining({ creationReason: 'initial_stock' }),
    )
  })

  it('runs enrichment, profile save and inventory creation without legacy fallback', async () => {
    mockStartEnrichment.mockResolvedValue({
      jobId: 'job-1',
      result: {
        status: 'intake_ready',
        pipelineResult: { readinessResult: { status: 'ready' } },
      },
    } as never)
    mockSaveProfile.mockResolvedValue({ profile: { id: 'profile-1' } } as never)
    mockCreateInventory.mockResolvedValue({
      operationId: 'op-1',
      idempotencyKey: 'idem:inventory',
      packageCount: 2,
      totalInitialQuantity: 50,
      baseUnit: 'kg',
      packages: [
        { item: { id: 'item-1' }, initialMovement: { quantityDelta: 25 } },
        { item: { id: 'item-2' }, initialMovement: { quantityDelta: 25 } },
      ],
    } as never)

    const draft = readyDraft()
    draft.packageCount = 2

    const result = await saveFertilizerCaptureToInventoryCore({
      draft,
      userId: 'user-1',
      creationReason: 'purchase',
    })

    expect(mockStartEnrichment).toHaveBeenCalledOnce()
    expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        enrichmentJobId: 'job-1',
        userConfirmed: true,
      }),
    )
    expect(mockCreateInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        savedProductProfileId: 'profile-1',
        confirmedPackageGroups: expect.arrayContaining([
          expect.objectContaining({ count: 2 }),
        ]),
      }),
    )
    expect(result.inventoryItemIds).toEqual(['item-1', 'item-2'])
  })

  it('blocks inventory creation when readiness is missing', async () => {
    mockStartEnrichment.mockResolvedValue({
      jobId: 'job-1',
      result: {
        status: 'needs_input',
        pipelineResult: { readinessResult: { status: 'missing_required_fields' } },
      },
    } as never)

    await expect(
      saveFertilizerCaptureToInventoryCore({
        draft: readyDraft(),
        userId: 'user-1',
        creationReason: 'purchase',
      }),
    ).rejects.toMatchObject({ code: 'not_save_ready' })

    expect(mockSaveProfile).not.toHaveBeenCalled()
    expect(mockCreateInventory).not.toHaveBeenCalled()
  })

  it('uses stable idempotency keys derived from the capture draft', async () => {
    mockStartEnrichment.mockResolvedValue({
      jobId: 'job-1',
      result: {
        status: 'intake_ready',
        pipelineResult: { readinessResult: { status: 'ready' } },
      },
    } as never)
    mockSaveProfile.mockResolvedValue({ profile: { id: 'profile-1' } } as never)
    mockCreateInventory.mockResolvedValue({
      operationId: 'op-1',
      idempotencyKey: 'capture-key:inventory',
      packageCount: 1,
      totalInitialQuantity: 25,
      baseUnit: 'kg',
      packages: [{ item: { id: 'item-1' }, initialMovement: { quantityDelta: 25 } }],
    } as never)

    const draft = readyDraft()
    draft.idempotencyKey = 'capture-key'

    await saveFertilizerCaptureToInventoryCore({
      draft,
      userId: 'user-1',
      creationReason: 'gift_received',
    })

    expect(mockStartEnrichment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'capture-key:enrichment' }),
    )
    expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'capture-key:profile' }),
    )
    expect(mockCreateInventory).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'capture-key:inventory' }),
    )
  })
})
