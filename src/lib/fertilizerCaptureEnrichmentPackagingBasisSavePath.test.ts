import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import type { ProductRecognizeResult } from '../types/productRecognize'
import {
  acceptRecognitionResult,
  applyStockRemainderAnswer,
  createInitialCaptureDraft,
  proceedToConfirm,
} from './fertilizerCaptureCore'
import {
  buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft,
  FERTILIZER_CAPTURE_ENRICHMENT_INPUT_BUILDER_PATH,
} from './fertilizerCaptureEnrichmentInputCore'
import {
  parseFertilizerCaptureSession,
  serializeFertilizerCaptureSession,
  buildFertilizerCaptureSessionDraft,
  createInitialCaptureUiState,
} from './fertilizerCaptureSessionCore'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'
import { validateFertilizerEnrichmentOrchestrationInputForTests } from './fertilizerEnrichmentServerServiceCore'
import { parseImageAnalysisResponse } from './productRecognizeImageCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import {
  mapDeclarationParseToAdapterResult,
  parseUserProvidedDeclarationText,
} from './fertilizerUserProvidedSourceAdapterCore'
import { buildRawFertilizerDeclarationInput } from './fertilizerSourceAdapterMergeCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const FIXED_RUN_ID = 'capture-save-packaging-basis-run'
const FIXED_NORM_ID = 'capture-save-packaging-basis-norm'
const FIXED_EVAL = '2026-07-29T10:00:05.000Z'

function buildPhotoFlowResultFromVision(record: Record<string, unknown>): ProductRecognizeResult {
  const analysis = parseImageAnalysisResponse(record)
  return {
    status: 'identified',
    identityConfidence: 1,
    dataCompleteness: 0.9,
    recognition: recognitionFromImageAnalysis(analysis),
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

function acceptPhotoFlowDraft(result: ProductRecognizeResult) {
  let draft = createInitialCaptureDraft()
  draft = acceptRecognitionResult(draft, result, {
    stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
  })
  draft = applyStockRemainderAnswer(draft, false)
  return proceedToConfirm(draft)
}

function stressManagerNoForm(): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 1,
    dataCompleteness: 0.9,
    recognition: recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: null,
      productDescriptor: null,
      manufacturer: 'Rasendoktor',
      npkLabel: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: 5,
      packageSizeUnit: 'kg',
      form: null,
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

function buildRecognition(overrides: {
  packageSizeValue: number
  packageSizeUnit: string
  form?: 'granular' | 'liquid' | 'unknown' | null
}): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 0.92,
    dataCompleteness: 0.7,
    recognition: recognitionFromImageAnalysis({
      brand: 'PlantCo',
      productLine: null,
      productName: 'Universal Boost',
      variant: '12-4-18',
      productDescriptor: null,
      manufacturer: 'PlantCo',
      npkLabel: '12-4-18',
      nitrogen: 12,
      phosphate: 4,
      potash: 18,
      packageSizeValue: overrides.packageSizeValue,
      packageSizeUnit: overrides.packageSizeUnit,
      form: overrides.form ?? 'unknown',
      gtin: null,
      textFragments: [],
      fieldConfidence: { packageSize: 0.95 },
    }),
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
  }
}

function buildSavePathInput(recognition: ProductRecognizeResult): FertilizerEnrichmentOrchestrationInput {
  let draft = createInitialCaptureDraft()
  draft = acceptRecognitionResult(draft, recognition, {
    stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
  })
  draft = applyStockRemainderAnswer(draft, false)
  draft = proceedToConfirm(draft)

  return buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
    enrichmentIdempotencyKey: 'capture-key:enrichment',
  })
}

function packagingAdapterWithUnknownForm(input: FertilizerEnrichmentOrchestrationInput) {
  const packagingText = input.captureInlineSourceTexts?.captureRecognitionLabel
  if (!packagingText) {
    throw new Error('Missing inline packaging text')
  }

  const declaration = parseUserProvidedDeclarationText(packagingText, input.identity, {
    requireManufacturer: false,
  })

  return mapDeclarationParseToAdapterResult(
    'packaging',
    'packaging_evidence',
    'packaging:captureRecognitionLabel',
    'captureRecognitionLabel',
    FIXED_NOW,
    null,
    null,
    'packaging_label_text',
    declaration,
  )
}

function evaluateCaptureSavePath(input: FertilizerEnrichmentOrchestrationInput) {
  const serialized = JSON.stringify({ input, idempotencyKey: 'capture-save-key' })
  const parsed = JSON.parse(serialized) as { input: unknown }
  const validated = validateFertilizerEnrichmentOrchestrationInputForTests(parsed.input)

  const raw = buildRawFertilizerDeclarationInput(
    validated,
    [
      {
        adapterType: 'manufacturer_product_document',
        status: 'no_match',
        sourceId: 'manufacturer:no-match',
        sourceType: 'web_page',
        sourceCategory: 'official_manufacturer',
        sourceRef: 'https://example.com/product',
        sourceTitle: null,
        retrievedAt: FIXED_NOW,
        sourceVersion: null,
      },
      packagingAdapterWithUnknownForm(validated),
    ],
    { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
  )

  return evaluateRawFertilizerDeclaration(raw, {
    normalizedAt: FIXED_NOW,
    normalizationRunId: FIXED_NORM_ID,
    evaluatedAt: FIXED_EVAL,
  })
}

describe('fertilizerCaptureEnrichmentPackagingBasisSavePath', () => {
  it('photo flow with string vision packageSizeValue writes draft package fields and enrichment basis', () => {
    const result = buildPhotoFlowResultFromVision({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: null,
      productDescriptor: null,
      manufacturer: 'Rasendoktor',
      npkLabel: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: '5',
      packageSizeUnit: 'kg',
      form: null,
      gtin: null,
      textFragments: [],
      fieldConfidence: { brand: 0.95, productLine: 0.9, productName: 0.92, npk: 0.93, packageSize: 0.9 },
    })

    const draft = acceptPhotoFlowDraft(result)

    expect(draft.selectedPackageQuantity).toBe(5)
    expect(draft.recognitionResult?.recognition.packageSize.normalizedValue).toBe(5)

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:photo-flow-string-package',
    })

    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
    expect(input.captureRecognitionPackagingBasis?.packageSizeUnit).toBe('kg')
    expect(input.captureDraftPackageDiagnostics?.preparedDraftPackageSizePresent).toBe(true)
    expect(input.captureDraftPackageDiagnostics?.preparedDraftPackageSizeSource).toBe(
      'recognition_result',
    )

    const serialized = JSON.stringify({ input })
    expect(serialized.includes('captureRecognitionPackagingBasis')).toBe(true)

    const readiness = evaluateCaptureSavePath(input)
    expect(readiness.readinessResult.status).toBe('ready')
    expect(readiness.readinessInput.productForm).toBe('granular')
  })

  it('photo flow with OCR textFragments only still writes packaging basis for 5 kg', () => {
    const result = buildPhotoFlowResultFromVision({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: null,
      productDescriptor: null,
      manufacturer: 'Rasendoktor',
      npkLabel: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: null,
      packageSizeUnit: null,
      form: null,
      gtin: null,
      textFragments: ['Rasendünger', 'Nettoinhalt 5 kg', '0-0-30'],
      fieldConfidence: { brand: 0.95, productLine: 0.9, productName: 0.92, npk: 0.93 },
    })

    const draft = acceptPhotoFlowDraft(result)

    expect(draft.selectedPackageQuantity).toBe(5)
    expect(draft.selectedPackageUnit).toBe('kg')
    expect(draft.recognitionResult?.recognition.packageSize.normalizedValue).toBe(5)

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:photo-flow-text-fragments',
    })

    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
    expect(input.captureDraftPackageDiagnostics?.preparedDraftPackageSizePresent).toBe(true)

    const readiness = evaluateCaptureSavePath(input)
    expect(readiness.readinessResult.status).toBe('ready')
    expect(readiness.readinessInput.productForm).toBe('granular')
    expect(readiness.readinessResult.missingRequirements).not.toContain('basis.product_form')
  })

  it('does not treat manual purchase quantity as recognized package size', () => {
    const result = buildPhotoFlowResultFromVision({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: null,
      productDescriptor: null,
      manufacturer: 'Rasendoktor',
      npkLabel: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: null,
      packageSizeUnit: null,
      form: null,
      gtin: null,
      textFragments: [],
      fieldConfidence: { brand: 0.95, productName: 0.92, npk: 0.93 },
    })

    let draft = acceptRecognitionResult(createInitialCaptureDraft(), result, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })
    draft = proceedToConfirm({ ...draft, quantity: 5, purchaseQuantity: 5 })

    expect(draft.selectedPackageQuantity).toBeNull()

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:purchase-only',
    })

    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBeNull()
    expect(input.captureDraftPackageDiagnostics?.preparedDraftPackageSizePresent).toBe(false)
    expect(input.captureDraftPackageDiagnostics?.preparedDraftPackageSizeSource).toBe('none')
  })

  it('keeps 5 kg packaging basis through save-path builder, json roundtrip and server validation', () => {
    const input = buildSavePathInput(stressManagerNoForm())

    expect(input.captureEnrichmentInputBuilderPath).toBe(
      FERTILIZER_CAPTURE_ENRICHMENT_INPUT_BUILDER_PATH,
    )
    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
    expect(input.captureRecognitionPackagingBasis?.packageSizeUnit).toBe('kg')

    const serialized = JSON.stringify({ input })
    expect(serialized.includes('captureRecognitionPackagingBasis')).toBe(true)

    const readiness = evaluateCaptureSavePath(input)
    expect(readiness.readinessResult.status).toBe('ready')
    expect(readiness.readinessInput.productForm).toBe('granular')
    expect(readiness.readinessResult.missingRequirements).not.toContain('basis.product_form')
  })

  it('retains recognition evidence after accept when recognitionResult is dropped from draft', () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(draft, stressManagerNoForm(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })
    draft = proceedToConfirm({ ...draft, recognitionResult: null })

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:rehydrate',
    })

    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
    expect(input.captureRecognitionPackagingBasis?.manufacturer).toBe('Rasendoktor')
  })

  it('updates legacy session draft without basis field using package fallbacks', () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(draft, stressManagerNoForm(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    const legacyCandidate = draft.recognitionCandidate
      ? ({
          ...draft.recognitionCandidate,
          recognitionSnapshot: undefined,
        } as unknown as typeof draft.recognitionCandidate)
      : null

    const legacyDraft = {
      ...proceedToConfirm(draft),
      recognitionResult: null,
      recognitionCandidate: legacyCandidate,
    }

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(legacyDraft, {
      enrichmentIdempotencyKey: 'capture-key:legacy',
    })

    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
    expect(input.captureRecognitionPackagingBasis?.packageSizeUnit).toBe('kg')
  })

  it('does not use a second legacy enrichment builder without packaging basis', () => {
    const input = buildSavePathInput(stressManagerNoForm())

    expect(input.captureEnrichmentInputBuilderPath).toBe('canonical_capture')
    expect(input.captureRecognitionPackagingBasis).toBeTruthy()
  })

  it('derives liquid product form from 1 l packaging unit fallback', () => {
    const input = buildSavePathInput(
      buildRecognition({ packageSizeValue: 1, packageSizeUnit: 'l', form: null }),
    )

    expect(input.captureRecognitionPackagingBasis?.packageSizeUnit).toBe('l')

    const readiness = evaluateCaptureSavePath(input)
    expect(readiness.readinessResult.status).toBe('ready')
    expect(readiness.readinessInput.productForm).toBe('liquid')
  })

  it('keeps needs_input when package size evidence is missing', () => {
    const input = buildSavePathInput(
      buildRecognition({ packageSizeValue: 0, packageSizeUnit: 'kg', form: null }),
    )

    const draftLikeInput = {
      ...input,
      captureRecognitionPackagingBasis: input.captureRecognitionPackagingBasis
        ? {
            ...input.captureRecognitionPackagingBasis,
            packageSizeValue: null,
            packageSizeUnit: null,
          }
        : undefined,
    }

    const readiness = evaluateCaptureSavePath(draftLikeInput)
    expect(readiness.readinessResult.status).toBe('needs_input')
    expect(readiness.readinessResult.missingRequirements).toContain('basis.product_form')
  })

  it('uses selectedPackageQuantity when recognition package size is empty', () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(draft, stressManagerNoForm(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    const recognition = draft.recognitionResult!.recognition
    recognition.packageSize = {
      ...recognition.packageSize,
      normalizedValue: null,
      unit: null,
    }

    draft = proceedToConfirm({
      ...draft,
      recognitionResult: { ...draft.recognitionResult!, recognition },
      selectedPackageQuantity: 5,
      selectedPackageUnit: 'kg',
    })

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:selected-package',
    })

    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
    expect(input.captureRecognitionPackagingBasis?.packageSizeUnit).toBe('kg')
  })

  it('survives session serialize and restore before enrichment input build', () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(draft, stressManagerNoForm(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })
    draft = proceedToConfirm({ ...draft, recognitionResult: null })

    const session = buildFertilizerCaptureSessionDraft({
      userId: 'user-1',
      captureDraft: draft,
      ui: createInitialCaptureUiState(draft),
    })

    const restored = parseFertilizerCaptureSession(serializeFertilizerCaptureSession(session))
    expect(restored?.captureDraft.recognitionResult).toBeNull()

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(restored!.captureDraft, {
      enrichmentIdempotencyKey: 'capture-key:session-restore',
    })

    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
  })
})
