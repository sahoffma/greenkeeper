import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import { acceptRecognitionResult, createInitialCaptureDraft } from './fertilizerCaptureCore'
import { buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft } from './fertilizerCaptureEnrichmentInputCore'
import {
  mapRecognitionProductFormToEnrichment,
  resolveRecognitionManufacturer,
} from './fertilizerRecognitionEnrichmentBasisCore'
import { buildRawFertilizerDeclarationInput } from './fertilizerSourceAdapterMergeCore'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'
import { mapDeclarationParseToAdapterResult } from './fertilizerUserProvidedSourceAdapterCore'
import { parseUserProvidedDeclarationText } from './fertilizerUserProvidedSourceAdapterCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const FIXED_RUN_ID = 'recognition-basis-run'
const FIXED_NORM_ID = 'recognition-basis-norm'
const FIXED_EVAL = '2026-07-29T10:00:05.000Z'

function stressManagerRecognition(overrides: {
  manufacturer?: string | null
  form?: 'granular' | 'liquid' | 'unknown'
  descriptor?: string | null
} = {}): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 0.96,
    dataCompleteness: 0.82,
    recognition: recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: '0-0-30',
      productDescriptor: overrides.descriptor ?? 'Rasendünger',
      manufacturer: overrides.manufacturer ?? null,
      npkLabel: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: 5,
      packageSizeUnit: 'kg',
      form: overrides.form ?? 'granular',
      gtin: null,
      textFragments: [],
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
}

function genericSecondFertilizerRecognition(): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 0.9,
    dataCompleteness: 0.75,
    recognition: recognitionFromImageAnalysis({
      brand: 'PlantCo',
      productLine: null,
      productName: 'Herbst-Boost',
      variant: '12-4-18',
      productDescriptor: null,
      manufacturer: null,
      npkLabel: '12-4-18',
      nitrogen: 12,
      phosphate: 4,
      potash: 18,
      packageSizeValue: 10,
      packageSizeUnit: 'kg',
      form: 'liquid',
      gtin: null,
      textFragments: [],
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
}

function buildCaptureInput(recognition: ProductRecognizeResult): FertilizerEnrichmentOrchestrationInput {
  let draft = createInitialCaptureDraft()
  draft = acceptRecognitionResult(draft, recognition, {
    stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
  })

  return buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
    enrichmentIdempotencyKey: 'capture-key:enrichment',
  })
}

function packagingAdapterSuccess(input: FertilizerEnrichmentOrchestrationInput) {
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

function evaluateCaptureRecognitionMerge(input: FertilizerEnrichmentOrchestrationInput) {
  const raw = buildRawFertilizerDeclarationInput(
    input,
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
      packagingAdapterSuccess(input),
    ],
    { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
  )

  return evaluateRawFertilizerDeclaration(raw, {
    normalizedAt: FIXED_NOW,
    normalizationRunId: FIXED_NORM_ID,
    evaluatedAt: FIXED_EVAL,
  })
}

describe('fertilizerRecognitionEnrichmentBasisCore', () => {
  it('maps manufacturer from brand when manufacturer field is empty', () => {
    expect(
      resolveRecognitionManufacturer({
        manufacturer: null,
        brand: 'Rasendoktor',
      }),
    ).toBe('Rasendoktor')
  })

  it('maps granular form from descriptor when form is unknown', () => {
    expect(mapRecognitionProductFormToEnrichment('unknown', 'Rasendünger')).toBe('granular')
  })

  it('maps liquid form directly', () => {
    expect(mapRecognitionProductFormToEnrichment('liquid', null)).toBe('liquid')
  })

  it('keeps ambiguous granular+liquid hints as unknown', () => {
    expect(mapRecognitionProductFormToEnrichment('granular', 'Flüssig-Rasendünger')).toBe('unknown')
  })
})

describe('fertilizerSourceAdapterMergeCore recognition packaging basis', () => {
  it('preserves manufacturer, product form, NPK 0-0-30 and zero-fills matrix when manufacturer adapter is no_match', () => {
    const input = buildCaptureInput(stressManagerRecognition())
    const result = evaluateCaptureRecognitionMerge(input)

    expect(input.identity.manufacturer).toBe('Rasendoktor')
    expect(result.readinessResult.status).toBe('ready')
    expect(result.readinessResult.missingRequirements).not.toContain('identity.manufacturer')
    expect(result.readinessResult.missingRequirements).not.toContain('basis.product_form')
    expect(result.readinessResult.missingRequirements).not.toContain('ingredients.matrix')
    expect(result.readinessResult.suggestedInputActions).not.toContain('confirm_product_form')

    expect(result.readinessInput.identity.manufacturer).toBe('Rasendoktor')
    expect(result.readinessInput.productForm).toBe('granular')
    expect(result.readinessInput.npk.nitrogen).toBe(0)
    expect(result.readinessInput.npk.phosphate).toBe(0)
    expect(result.readinessInput.npk.potash).toBe(30)

    for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
      expect(result.readinessInput.nutrientMatrix[key]?.value).toBe(
        key === 'potash' ? 30 : 0,
      )
    }
  })

  it('works for a second generic fertilizer without product-specific hardcoding', () => {
    const input = buildCaptureInput(genericSecondFertilizerRecognition())
    const result = evaluateCaptureRecognitionMerge(input)

    expect(result.readinessResult.status).toBe('ready')
    expect(result.readinessInput.identity.manufacturer).toBe('Plantco')
    expect(result.readinessInput.productForm).toBe('liquid')
    expect(result.readinessInput.npk.nitrogen).toBe(12)
    expect(result.readinessInput.npk.phosphate).toBe(4)
    expect(result.readinessInput.npk.potash).toBe(18)
  })

  it('still requires confirm_product_form when recognition form is truly missing', () => {
    const input = buildCaptureInput(stressManagerRecognition())
    const basis = {
      sourceId: 'captureRecognitionLabel',
      manufacturer: 'Rasendoktor',
      officialName: 'Stress-Manager',
      productLine: 'Professional',
      variant: '0-0-30',
      productForm: null,
      npk: { nitrogen: 0, phosphate: 0, potash: 30 },
    }

    const packagingText = input.captureInlineSourceTexts?.captureRecognitionLabel ?? ''
    const textWithoutForm = packagingText
      .split('\n')
      .filter((line) => !/^Form:/i.test(line))
      .join('\n')

    const declaration = parseUserProvidedDeclarationText(textWithoutForm, input.identity, {
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

    const raw = buildRawFertilizerDeclarationInput(
      {
        ...input,
        captureRecognitionPackagingBasis: basis,
      },
      [packagingResult],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    const result = evaluateRawFertilizerDeclaration(raw, {
      normalizedAt: FIXED_NOW,
      normalizationRunId: FIXED_NORM_ID,
      evaluatedAt: FIXED_EVAL,
    })

    expect(result.readinessResult.status).toBe('needs_input')
    expect(result.readinessResult.missingRequirements).toContain('basis.product_form')
    expect(result.readinessResult.suggestedInputActions).toContain('confirm_product_form')
  })
})
