import { describe, expect, it } from 'vitest'
import {
  buildEmptyFieldConfidenceRecord,
  parseImageAnalysisResponse,
} from './productRecognizeImageCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import { runProductRecognition } from './productRecognizeCore'
import {
  acceptRecognitionResult,
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
import type { ProductRecognizeCatalogItem, ProductRecognizeResult } from '../types/productRecognize'
import {
  buildPackageSizeHandoffDiagnostics,
  hasRecognitionPackageSize,
} from './productRecognizePackageHandoffDiagnosticsCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const FIXED_RUN_ID = 'handoff-run'
const FIXED_NORM_ID = 'handoff-norm'
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

function simulateClientRecognitionResponse(result: ProductRecognizeResult): ProductRecognizeResult {
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

function evaluateHandoffSavePath(
  input: ReturnType<typeof buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft>,
) {
  const serialized = JSON.stringify({ input, idempotencyKey: 'handoff-save-key' })
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

const catalogExact: ProductRecognizeCatalogItem[] = [
  {
    id: 'prod-stress-manager',
    manufacturer: 'Rasendoktor',
    officialName: 'Stress-Manager',
    aliases: ['Rasendoktor Professional Stress-Manager'],
    npk: '0-0-30',
    productForm: 'granular',
    nPercent: 0,
    p2o5Percent: 0,
    k2oPercent: 30,
    defaultUnit: 'kg',
  },
]

describe('productRecognize package handoff', () => {
  it('preserves 5 kg through recognition, json roundtrip, accept, draft and enrichment', async () => {
    const visionRecord = buildOpenAiVisionRecord()
    const analysis = parseImageAnalysisResponse(visionRecord)
    const mappedRecognition = recognitionFromImageAnalysis(analysis)

    expect(hasRecognitionPackageSize(mappedRecognition)).toBe(true)
    expect(mappedRecognition.packageSize.normalizedValue).toBe(5)
    expect(mappedRecognition.packageSize.unit).toBe('kg')

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

    expect(serverResult.recognition.packageSize.normalizedValue).toBe(5)

    const serializedResponse = simulateClientRecognitionResponse(serverResult)
    expect(serializedResponse.recognition.packageSize.normalizedValue).toBe(5)
    expect(serializedResponse.recognition.packageSize.unit).toBe('kg')

    const clientDiagnostics = buildPackageSizeHandoffDiagnostics({
      imageAnalysis: analysis,
      identityMapperInput: analysis,
      identityMapperOutput: mappedRecognition,
      finalRecognition: serverResult.recognition,
      responseRecognition: serializedResponse.recognition,
      clientRecognition: serializedResponse.recognition,
    })
    expect(clientDiagnostics.packageSizeHandoffLossStage).toBe('none')

    let draft = acceptRecognitionResult(createInitialCaptureDraft(), serializedResponse, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })
    draft = applyStockRemainderAnswer(draft, false)
    draft = proceedToConfirm(draft)

    expect(draft.selectedPackageQuantity).toBe(5)
    expect(draft.selectedPackageUnit).toBe('kg')
    expect(draft.recognitionResult?.recognition.packageSize.normalizedValue).toBe(5)

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'handoff-key',
    })

    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
    expect(input.captureRecognitionPackagingBasis?.packageSizeUnit).toBe('kg')
    expect(input.captureDraftPackageDiagnostics?.recognitionResultPackageSizePresent).toBe(true)
    expect(input.captureDraftPackageDiagnostics?.acceptOutputSelectedPackagePresent).toBe(true)
    expect(input.captureDraftPackageDiagnostics?.acceptOutputRecognitionPackageSizePresent).toBe(
      true,
    )

    const readiness = evaluateHandoffSavePath(input)
    expect(readiness.readinessResult.status).toBe('ready')
    expect(readiness.readinessInput.productForm).toBe('granular')
    expect(readiness.readinessResult.missingRequirements).not.toContain('basis.product_form')
  })

  it('keeps package size on catalog match when identity mapper output is present', async () => {
    const analysis = parseImageAnalysisResponse(buildOpenAiVisionRecord())

    const serverResult = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      {
        analyzeImage: async () => analysis,
        loadCatalog: async () => catalogExact,
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

    expect(serverResult.catalogMatch.matched).toBe(true)
    expect(serverResult.recognition.packageSize.normalizedValue).toBe(5)

    const draft = acceptRecognitionResult(
      createInitialCaptureDraft(),
      simulateClientRecognitionResponse(serverResult),
      { stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' } },
    )

    expect(draft.selectedPackageQuantity).toBe(5)
    expect(draft.recognitionCandidate).toBeNull()
    expect(draft.recognitionResult?.recognition.packageSize.normalizedValue).toBe(5)
  })
})
