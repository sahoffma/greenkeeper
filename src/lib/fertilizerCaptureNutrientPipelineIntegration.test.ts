import { describe, expect, it } from 'vitest'
import { acceptRecognitionResult, createInitialCaptureDraft } from './fertilizerCaptureCore'
import { buildCaptureRecognitionPackagingDeclarationText } from './fertilizerCaptureRecognitionPackagingCore'
import { buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft } from './fertilizerCaptureEnrichmentInputCore'
import { mapEnrichmentNutrientMatrixToSaved } from './fertilizerProductProfileSaveCore'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'
import {
  mapDeclarationParseToAdapterResult,
  parseUserProvidedDeclarationText,
} from './fertilizerUserProvidedSourceAdapterCore'
import { buildRawFertilizerDeclarationInput } from './fertilizerSourceAdapterMergeCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const FIXED_RUN_ID = 'nutrient-pipeline-run'
const FIXED_NORM_ID = 'nutrient-pipeline-norm'
const FIXED_EVAL = '2026-07-29T10:00:05.000Z'

function buildCaptureDraftWithLabelComposition() {
  const recognitionResult: ProductRecognizeResult = {
    status: 'identified',
    identityConfidence: 0.96,
    dataCompleteness: 0.82,
    recognition: recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: '0-0-30',
      productDescriptor: 'Rasendünger',
      manufacturer: null,
      npkLabel: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: 5,
      packageSizeUnit: 'kg',
      form: 'granular',
      gtin: null,
      textFragments: [
        'NPK 0-0-30',
        'Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 0,1 % Kupfer (Cu), 3,0 % Eisen (Fe), 0,1 % Mangan (Mn), 0,1 % Zink (Zn)',
      ],
      fieldConfidence: {},
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

  let draft = createInitialCaptureDraft()
  draft = acceptRecognitionResult(draft, recognitionResult, {
    stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
  })
  return draft
}

describe('fertilizerCaptureNutrientPipelineIntegration', () => {
  it('includes label OCR text in packaging declaration input', () => {
    const draft = buildCaptureDraftWithLabelComposition()
    const text = buildCaptureRecognitionPackagingDeclarationText(draft)

    expect(text).toContain('Packaging label text:')
    expect(text).toContain('Schwefel (S)')
    expect(text).not.toContain('Declaration section complete')
  })

  it('preserves positive trace nutrients through merge and save mapping', () => {
    const draft = buildCaptureDraftWithLabelComposition()
    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:enrichment',
    })
    const packagingText = input.captureInlineSourceTexts?.captureRecognitionLabel
    expect(packagingText).toBeTruthy()

    const declaration = parseUserProvidedDeclarationText(packagingText!, input.identity, {
      requireManufacturer: false,
    })
    const packagingResult = mapDeclarationParseToAdapterResult(
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

    const raw = buildRawFertilizerDeclarationInput(input, [packagingResult], {
      enrichmentRunId: FIXED_RUN_ID,
      extractedAt: FIXED_NOW,
    })

    expect(raw.nutrientMatrix.iron?.status).toBe('declared')
    expect(raw.nutrientMatrix.iron?.value).toBe(3)
    expect(raw.nutrientMatrix.sulfur?.status).toBe('declared')
    expect(raw.nutrientMatrix.sulfur?.value).toBe(10.2)
    expect(raw.nutrientMatrix.iron?.value).not.toBe(0)

    const pipeline = evaluateRawFertilizerDeclaration(raw, {
      normalizedAt: FIXED_NOW,
      normalizationRunId: FIXED_NORM_ID,
      evaluatedAt: FIXED_EVAL,
    })

    expect(pipeline.normalizationResult.enrichmentResult.nutrientMatrix.iron?.value).toBe(3)
    expect(pipeline.normalizationResult.enrichmentResult.nutrientMatrix.sulfur?.value).toBe(10.2)

    const saved = mapEnrichmentNutrientMatrixToSaved(
      pipeline.normalizationResult.enrichmentResult.nutrientMatrix,
    )

    expect(saved.iron?.value).toBe(3)
    expect(saved.sulfur?.value).toBe(10.2)
  })

  it('does not invent zero values for unknown nutrients when only NPK is synthesized', () => {
    const draft = buildCaptureDraftWithLabelComposition()
    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:enrichment',
    })

    const npkOnlyText = [
      'Manufacturer: Rasendoktor',
      'Product: Stress-Manager',
      'NPK 0-0-30',
      'Declaration basis (N / P2O5 / K2O)',
      'Nitrogen (N): 0%',
      'Phosphate (P2O5): 0%',
      'Potash (K2O): 30%',
    ].join('\n')

    const declaration = parseUserProvidedDeclarationText(npkOnlyText, input.identity, {
      requireManufacturer: false,
    })
    const packagingResult = mapDeclarationParseToAdapterResult(
      'packaging',
      'packaging_evidence',
      'packaging:npk-only',
      'captureRecognitionLabel',
      FIXED_NOW,
      null,
      null,
      'packaging_label_text',
      declaration,
    )

    const raw = buildRawFertilizerDeclarationInput(input, [packagingResult], {
      enrichmentRunId: FIXED_RUN_ID,
      extractedAt: FIXED_NOW,
    })

    expect(raw.nutrientMatrix.iron?.status).not.toBe('not_declared')
    expect(raw.nutrientMatrix.iron?.value).toBeUndefined()
  })
})
