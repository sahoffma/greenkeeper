import { describe, expect, it } from 'vitest'
import { acceptRecognitionResult, createInitialCaptureDraft } from './fertilizerCaptureCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'
import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import {
  appendCaptureRecognitionPackagingToEnrichmentInput,
  buildCaptureRecognitionPackagingDeclarationText,
  CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID,
} from './fertilizerCaptureRecognitionPackagingCore'
import { buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft } from './fertilizerCaptureEnrichmentInputCore'

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
      textFragments: ['Rasendoktor Professional', 'NPK 14-28-10'],
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

describe('fertilizerCaptureRecognitionPackagingCore', () => {
  it('builds packaging declaration text from recognition', () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(draft, mockRecognitionResult(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    const text = buildCaptureRecognitionPackagingDeclarationText(draft)
    expect(text).toContain('Product: Frühjahr')
    expect(text).toContain('NPK 14-28-10')
    expect(text).toContain('Nitrogen (N): 14%')
  })

  it('appends inline packaging sources to enrichment input', () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(draft, mockRecognitionResult(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    const input: FertilizerEnrichmentOrchestrationInput =
      appendCaptureRecognitionPackagingToEnrichmentInput(
      {
        objectCategory: 'fertilizer',
        identity: {
          manufacturer: 'Rasendoktor',
          officialName: 'Frühjahr',
          productLine: 'Professional',
          variant: null,
          identityFingerprint: 'fp-1',
          identityConfidence: 1,
          hasIdentityAmbiguity: false,
        },
        allowedInputChannels: ['capture_flow'],
      },
      draft,
    )

    expect(input.userProvidedSources).toEqual([
      {
        kind: 'packaging_back_photo',
        referenceId: CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID,
      },
    ])
    expect(input.captureInlineSourceTexts?.[CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID]).toContain(
      'Frühjahr',
    )
  })

  it('includes capture packaging in orchestration input from capture draft', () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(draft, mockRecognitionResult(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:enrichment',
    })

    expect(input.captureInlineSourceTexts?.[CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID]).toBeTruthy()
  })
})
