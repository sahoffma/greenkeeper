import { describe, expect, it } from 'vitest'
import {
  buildEmptyFieldConfidenceRecord,
  parseImageAnalysisResponse,
} from './productRecognizeImageCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import { runProductRecognition } from './productRecognizeCore'
import {
  applyStockRemainderAnswer,
  createInitialCaptureDraft,
  proceedToConfirm,
} from './fertilizerCaptureCore'
import { buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft } from './fertilizerCaptureEnrichmentInputCore'
import { validateFertilizerEnrichmentOrchestrationInputForTests } from './fertilizerEnrichmentServerServiceCore'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'
import {
  mapDeclarationParseToAdapterResult,
  parseUserProvidedDeclarationText,
} from './fertilizerUserProvidedSourceAdapterCore'
import { buildRawFertilizerDeclarationInput } from './fertilizerSourceAdapterMergeCore'
import { GENERIC_LABEL_COMPOSITION_TEXT_FRAGMENTS } from './fertilizerCaptureNutrientTestFixtures'
import { createInitialPhotoRecognitionSession } from './fertilizerCaptureSessionCore'
import type { ProductRecognizeResult } from '../types/productRecognize'
import {
  buildRecognitionClientParsedHandoffPatch,
  probeRecognitionResultPackageSize,
  resolvePhotoRecognitionAcceptInvocation,
  runCaptureFlowRecognitionAccept,
  storePhotoRecognitionAnalysisResult,
} from './fertilizerCaptureRecognitionClientHandoffCore'
import { fingerprintFromRecognitionResult } from './fertilizerInventoryCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const FIXED_RUN_ID = 'client-handoff-run'
const FIXED_NORM_ID = 'client-handoff-norm'
const FIXED_EVAL = '2026-07-29T10:00:05.000Z'

function buildOpenAiVisionRecord(): Record<string, unknown> {
  return {
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
    textFragments: [...GENERIC_LABEL_COMPOSITION_TEXT_FRAGMENTS],
    fieldConfidence: {
      ...buildEmptyFieldConfidenceRecord(),
      brand: 0.95,
      productLine: 0.9,
      productName: 0.92,
      npk: 0.93,
      packageSize: 0.9,
    },
  }
}

function simulateHttpJsonRoundtrip(result: ProductRecognizeResult): ProductRecognizeResult {
  return JSON.parse(JSON.stringify(result)) as ProductRecognizeResult
}

function packagingAdapterWithUnknownForm(
  input: ReturnType<typeof buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft>,
) {
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

function evaluateEnrichmentSavePath(
  input: ReturnType<typeof buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft>,
) {
  const validated = validateFertilizerEnrichmentOrchestrationInputForTests(
    JSON.parse(JSON.stringify({ input, idempotencyKey: 'client-handoff-key' })).input,
  )

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

describe('fertilizerCaptureRecognitionClientHandoff', () => {
  it('preserves 5 kg through photo session store, accept click handler and enrichment input', async () => {
    const analysis = parseImageAnalysisResponse(buildOpenAiVisionRecord())

    const serverResult = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      {
        analyzeImage: async () => analysis,
        loadCatalog: async () => [],
        searchProvider: {
          name: 'mock',
          searchAndExtract: async () => ({
            fields: [],
            sources: [],
            conflicts: [],
            provider: 'mock',
          }),
        },
        prepareImage: async ({ base64, mimeType }) => ({
          base64,
          mimeType,
          prep: {
            originalFormat: mimeType,
            processedFormat: mimeType,
            originalBytes: 1,
            processedBytes: 1,
            originalWidth: 1,
            originalHeight: 1,
            processedWidth: 1,
            processedHeight: 1,
            conversionMs: 0,
            compressionMs: 0,
            converted: false,
          },
        }),
      },
    )

    const httpResult = simulateHttpJsonRoundtrip(serverResult)
    expect(probeRecognitionResultPackageSize(httpResult)).toBe(true)

    const parsedPatch = buildRecognitionClientParsedHandoffPatch(httpResult)
    expect(parsedPatch.recognitionHttpResponsePackageSizePresent).toBe(true)
    expect(parsedPatch.recognitionClientParsedPackageSizePresent).toBe(true)

    const stored = storePhotoRecognitionAnalysisResult(
      createInitialPhotoRecognitionSession(),
      httpResult,
      null,
    )

    expect(stored.session.phase).toBe('result')
    expect(probeRecognitionResultPackageSize(stored.session.result)).toBe(true)
    expect(stored.trace.recognitionStateStoredPackageSizePresent).toBe(true)
    expect(stored.trace.clientPackageSizeLossStage).toBe('none')

    const acceptInvocation = resolvePhotoRecognitionAcceptInvocation(
      stored.session,
      stored.trace,
    )
    expect(acceptInvocation).not.toBeNull()
    expect(acceptInvocation?.acceptArgumentKind).toBe('full_result')
    expect(probeRecognitionResultPackageSize(acceptInvocation?.result)).toBe(true)
    expect(acceptInvocation?.trace.recognitionAcceptHandlerPackageSizePresent).toBe(true)

    const accepted = await runCaptureFlowRecognitionAccept({
      draft: createInitialCaptureDraft(),
      acceptInvocation: acceptInvocation!,
      catalogProductId: null,
      identityFingerprint: fingerprintFromRecognitionResult(httpResult),
      fetchStockStatus: async () => ({ status: 'first_time', currentBalance: 0, unit: 'kg' }),
    })

    let draft = applyStockRemainderAnswer(accepted.draft, false)
    draft = proceedToConfirm(draft)

    expect(draft.selectedPackageQuantity).toBe(5)
    expect(draft.selectedPackageUnit).toBe('kg')
    expect(draft.recognitionResult?.recognition.packageSize.normalizedValue).toBe(5)
    expect(accepted.trace.clientPackageSizeLossStage).toBe('none')
    expect(accepted.trace.recognitionAcceptArgumentKind).toBe('full_result')

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'client-handoff-key',
    })

    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
    expect(input.captureRecognitionPackagingBasis?.packageSizeUnit).toBe('kg')
    expect(input.captureDraftPackageDiagnostics?.recognitionHttpResponsePackageSizePresent).toBe(
      true,
    )
    expect(input.captureDraftPackageDiagnostics?.recognitionClientParsedPackageSizePresent).toBe(
      true,
    )
    expect(input.captureDraftPackageDiagnostics?.recognitionStateStoredPackageSizePresent).toBe(
      true,
    )
    expect(input.captureDraftPackageDiagnostics?.recognitionAcceptHandlerPackageSizePresent).toBe(
      true,
    )
    expect(input.captureDraftPackageDiagnostics?.recognitionAcceptArgumentKind).toBe('full_result')
    expect(input.captureDraftPackageDiagnostics?.clientPackageSizeLossStage).toBe('none')

    const validated = validateFertilizerEnrichmentOrchestrationInputForTests(input)
    expect(validated.captureDraftPackageDiagnostics?.recognitionHttpResponsePackageSizePresent).toBe(
      true,
    )

    const readiness = evaluateEnrichmentSavePath(input)
    expect(readiness.readinessResult.status).toBe('ready')
    expect(readiness.readinessInput.productForm).toBe('granular')
    expect(readiness.readinessResult.missingRequirements).not.toContain('basis.product_form')
  })

  it('detects state_storage loss when session result is replaced without package size', () => {
    const analysis = parseImageAnalysisResponse(buildOpenAiVisionRecord())
    const fullResult: ProductRecognizeResult = {
      status: 'identified',
      identityConfidence: 0.9,
      dataCompleteness: 0.5,
      recognition: recognitionFromImageAnalysis(analysis),
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

    const stored = storePhotoRecognitionAnalysisResult(
      createInitialPhotoRecognitionSession(),
      fullResult,
      null,
    )

    const brokenSession = {
      ...stored.session,
      result: {
        ...fullResult,
        recognition: {
          ...fullResult.recognition,
          packageSize: {
            ...fullResult.recognition.packageSize,
            normalizedValue: null,
            unit: null,
            rawValue: null,
          },
        },
      },
    }

    const acceptInvocation = resolvePhotoRecognitionAcceptInvocation(brokenSession, stored.trace)
    expect(acceptInvocation?.trace.recognitionAcceptHandlerPackageSizePresent).toBe(false)
    expect(acceptInvocation?.trace.clientPackageSizeLossStage).toBe('accept_handler')
  })
})
