import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import type { ProductRecognizeResult } from '../types/productRecognize'
import { acceptRecognitionResult, createInitialCaptureDraft } from './fertilizerCaptureCore'
import { buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft } from './fertilizerCaptureEnrichmentInputCore'
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
const FIXED_RUN_ID = 'form-serialization-run'
const FIXED_NORM_ID = 'form-serialization-norm'
const FIXED_EVAL = '2026-07-29T10:00:05.000Z'

function buildRecognitionFromVisionForm(formValue: string | null): ProductRecognizeResult {
  const analysis = parseImageAnalysisResponse({
    brand: 'PlantCo',
    productLine: null,
    productName: 'Herbst-Boost',
    variant: '12-4-18',
    productDescriptor: 'Rasendünger',
    manufacturer: 'PlantCo',
    npkLabel: '12-4-18',
    nitrogen: 12,
    phosphate: 4,
    potash: 18,
    packageSizeValue: 10,
    packageSizeUnit: 'kg',
    form: formValue,
    gtin: null,
    textFragments: [],
    fieldConfidence: { form: 0.9, productDescriptor: 0.8 },
  })

  return {
    status: 'identified',
    identityConfidence: 0.9,
    dataCompleteness: 0.75,
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
}

function buildCaptureInput(recognition: ProductRecognizeResult): FertilizerEnrichmentOrchestrationInput {
  let draft = createInitialCaptureDraft()
  draft = acceptRecognitionResult(draft, recognition, {
    stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
  })

  return buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
    enrichmentIdempotencyKey: 'capture-key:form-serialization',
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

function evaluateAfterServerValidation(input: FertilizerEnrichmentOrchestrationInput) {
  const serialized = JSON.stringify({ input, idempotencyKey: 'form-serialization-key' })
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

describe('fertilizerEnrichmentRecognitionFormSerializationCore', () => {
  it('1 — Rasendünger / granular in vision form reaches basis.product_form as granular', () => {
    const input = buildCaptureInput(buildRecognitionFromVisionForm('Rasendünger / granular'))
    const result = evaluateAfterServerValidation(input)

    expect(input.captureRecognitionPackagingBasis?.productForm).toBe('granular')
    expect(input.captureRecognitionPackagingBasis?.recognitionFormLabel).toBe('Rasendünger / granular')
    expect(result.readinessResult.status).toBe('ready')
    expect(result.readinessInput.productForm).toBe('granular')
    expect(result.readinessResult.missingRequirements).not.toContain('basis.product_form')
  })

  it('2 — form in normalized enum value maps to granular', () => {
    const input = buildCaptureInput(buildRecognitionFromVisionForm('granular'))
    const result = evaluateAfterServerValidation(input)

    expect(result.readinessInput.productForm).toBe('granular')
    expect(result.readinessResult.missingRequirements).not.toContain('basis.product_form')
  })

  it('3 — form only in productDescriptor is adopted when unambiguous', () => {
    const analysis = parseImageAnalysisResponse({
      brand: 'PlantCo',
      productLine: null,
      productName: 'Herbst-Boost',
      variant: '12-4-18',
      productDescriptor: 'Rasendünger / granular',
      manufacturer: 'PlantCo',
      npkLabel: '12-4-18',
      nitrogen: 12,
      phosphate: 4,
      potash: 18,
      packageSizeValue: 10,
      packageSizeUnit: 'kg',
      form: 'unknown',
      gtin: null,
      textFragments: [],
      fieldConfidence: { form: 0.2, productDescriptor: 0.9 },
    })

    const input = buildCaptureInput({
      ...buildRecognitionFromVisionForm('unknown'),
      recognition: recognitionFromImageAnalysis(analysis),
    })
    const result = evaluateAfterServerValidation(input)

    expect(input.captureRecognitionPackagingBasis?.productForm).toBe('granular')
    expect(result.readinessInput.productForm).toBe('granular')
  })

  it('4 — adapter unknown does not overwrite recognition granular fallback', () => {
    const input = buildCaptureInput(buildRecognitionFromVisionForm('Rasendünger / granular'))
    const textWithoutForm = (input.captureInlineSourceTexts?.captureRecognitionLabel ?? '')
      .split('\n')
      .filter((line) => !/^Form:/i.test(line))
      .join('\n')

    const validated = validateFertilizerEnrichmentOrchestrationInputForTests(
      JSON.parse(
        JSON.stringify({
          ...input,
          captureInlineSourceTexts: {
            captureRecognitionLabel: textWithoutForm,
          },
        }),
      ),
    )

    const packagingResult = packagingAdapterWithUnknownForm(validated)
    expect(packagingResult.status === 'success' || packagingResult.status === 'partial').toBe(true)
    if (packagingResult.status === 'success' || packagingResult.status === 'partial') {
      expect(packagingResult.extraction.extractedProductForm).toBe('unknown')
    }

    const raw = buildRawFertilizerDeclarationInput(validated, [packagingResult], {
      enrichmentRunId: FIXED_RUN_ID,
      extractedAt: FIXED_NOW,
    })
    const result = evaluateRawFertilizerDeclaration(raw, {
      normalizedAt: FIXED_NOW,
      normalizationRunId: FIXED_NORM_ID,
      evaluatedAt: FIXED_EVAL,
    })

    expect(result.readinessInput.productForm).toBe('granular')
  })

  it('5 — wrong client property name drops basis labels and fails readiness guard', () => {
    const input = buildCaptureInput(buildRecognitionFromVisionForm('Rasendünger / granular'))
    const textWithoutForm = (input.captureInlineSourceTexts?.captureRecognitionLabel ?? '')
      .split('\n')
      .filter((line) => !/^Form:/i.test(line))
      .join('\n')

    const serialized = JSON.stringify({
      input: {
        ...input,
        captureInlineSourceTexts: {
          captureRecognitionLabel: textWithoutForm,
        },
        captureRecognitionPackagingBasiss: input.captureRecognitionPackagingBasis,
        captureRecognitionPackagingBasis: undefined,
      },
      idempotencyKey: 'form-serialization-key',
    })
    const parsed = JSON.parse(serialized) as { input: unknown }
    const validated = validateFertilizerEnrichmentOrchestrationInputForTests(parsed.input)

    expect(validated.captureRecognitionPackagingBasis).toBeUndefined()

    const raw = buildRawFertilizerDeclarationInput(
      validated,
      [packagingAdapterWithUnknownForm(validated)],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )
    const result = evaluateRawFertilizerDeclaration(raw, {
      normalizedAt: FIXED_NOW,
      normalizationRunId: FIXED_NORM_ID,
      evaluatedAt: FIXED_EVAL,
    })

    expect(result.readinessResult.status).toBe('needs_input')
    expect(result.readinessResult.missingRequirements).toContain('basis.product_form')
  })

  it('6 — truly missing form remains needs_input', () => {
    const analysis = parseImageAnalysisResponse({
      brand: 'PlantCo',
      productLine: null,
      productName: 'Herbst-Boost',
      variant: '12-4-18',
      productDescriptor: 'Rasendünger',
      manufacturer: 'PlantCo',
      npkLabel: '12-4-18',
      nitrogen: 12,
      phosphate: 4,
      potash: 18,
      packageSizeValue: 10,
      packageSizeUnit: 'kg',
      form: 'unknown',
      gtin: null,
      textFragments: [],
      fieldConfidence: { form: 0.1, productDescriptor: 0.8 },
    })

    const input = buildCaptureInput({
      ...buildRecognitionFromVisionForm('unknown'),
      recognition: recognitionFromImageAnalysis(analysis),
    })

    const textWithoutForm = (input.captureInlineSourceTexts?.captureRecognitionLabel ?? '')
      .split('\n')
      .filter((line) => !/^Form:/i.test(line))
      .join('\n')

    const serialized = JSON.stringify({
      input: {
        ...input,
        captureInlineSourceTexts: {
          captureRecognitionLabel: textWithoutForm,
        },
      },
    })
    const validated = validateFertilizerEnrichmentOrchestrationInputForTests(
      JSON.parse(serialized).input,
    )
    const declaration = parseUserProvidedDeclarationText(textWithoutForm, validated.identity, {
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

    const raw = buildRawFertilizerDeclarationInput(validated, [packagingResult], {
      enrichmentRunId: FIXED_RUN_ID,
      extractedAt: FIXED_NOW,
    })
    const result = evaluateRawFertilizerDeclaration(raw, {
      normalizedAt: FIXED_NOW,
      normalizationRunId: FIXED_NORM_ID,
      evaluatedAt: FIXED_EVAL,
    })

    expect(result.readinessResult.status).toBe('needs_input')
    expect(result.readinessResult.missingRequirements).toContain('basis.product_form')
  })
})
