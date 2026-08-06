import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import type { ProductRecognizeResult } from '../types/productRecognize'
import { acceptRecognitionResult, createInitialCaptureDraft } from './fertilizerCaptureCore'
import { buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft } from './fertilizerCaptureEnrichmentInputCore'
import { validateFertilizerEnrichmentOrchestrationInputForTests } from './fertilizerEnrichmentServerServiceCore'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'
import {
  inferProductFormFromPackageUnit,
  PRODUCT_FORM_UNIT_CONFLICT_ID,
  resolveCapturePackageUnitInferredFormProvenanceId,
} from './fertilizerRecognitionEnrichmentBasisCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import {
  mapDeclarationParseToAdapterResult,
  parseUserProvidedDeclarationText,
} from './fertilizerUserProvidedSourceAdapterCore'
import { buildRawFertilizerDeclarationInput } from './fertilizerSourceAdapterMergeCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const FIXED_RUN_ID = 'package-unit-form-run'
const FIXED_NORM_ID = 'package-unit-form-norm'
const FIXED_EVAL = '2026-07-29T10:00:05.000Z'

function buildRecognition(input: {
  form?: 'granular' | 'liquid' | 'unknown' | null
  packageSizeValue: number
  packageSizeUnit: string
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
      productDescriptor: 'Rasendünger',
      manufacturer: 'PlantCo',
      npkLabel: '12-4-18',
      nitrogen: 12,
      phosphate: 4,
      potash: 18,
      packageSizeValue: input.packageSizeValue,
      packageSizeUnit: input.packageSizeUnit,
      form: input.form ?? 'unknown',
      gtin: null,
      textFragments: [],
      fieldConfidence: { form: 0.1, packageSize: 0.95 },
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
    enrichmentIdempotencyKey: 'capture-key:package-unit-form',
  })
}

function stripInlineFormLine(input: FertilizerEnrichmentOrchestrationInput): FertilizerEnrichmentOrchestrationInput {
  const packagingText = input.captureInlineSourceTexts?.captureRecognitionLabel
  if (!packagingText) {
    return input
  }

  return {
    ...input,
    captureInlineSourceTexts: {
      captureRecognitionLabel: packagingText
        .split('\n')
        .filter((line) => !/^Form:/i.test(line))
        .join('\n'),
    },
  }
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

function evaluateCapturePath(input: FertilizerEnrichmentOrchestrationInput) {
  const prepared = stripInlineFormLine(input)
  const serialized = JSON.stringify({ input: prepared, idempotencyKey: 'package-unit-key' })
  const validated = validateFertilizerEnrichmentOrchestrationInputForTests(
    JSON.parse(serialized).input,
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

describe('inferProductFormFromPackageUnit', () => {
  it.each([
    ['kg', 'granular'],
    ['g', 'granular'],
    ['KG', 'granular'],
    ['l', 'liquid'],
    ['ml', 'liquid'],
    ['Liter', 'liquid'],
    ['piece', null],
  ] as const)('maps %s → %s', (unit, expected) => {
    expect(inferProductFormFromPackageUnit(unit)).toBe(expected)
  })
})

describe('fertilizerProductFormPackageUnitCore reference cases', () => {
  it('1 — 5 kg without form → granular', () => {
    const result = evaluateCapturePath(buildCaptureInput(buildRecognition({ packageSizeValue: 5, packageSizeUnit: 'kg' })))

    expect(result.readinessInput.productForm).toBe('granular')
    expect(result.readinessResult.missingRequirements).not.toContain('basis.product_form')
  })

  it('2 — 2.5 kg without form → granular', () => {
    const result = evaluateCapturePath(
      buildCaptureInput(buildRecognition({ packageSizeValue: 2.5, packageSizeUnit: 'kg' })),
    )

    expect(result.readinessInput.productForm).toBe('granular')
  })

  it('3 — 500 g without form → granular', () => {
    const result = evaluateCapturePath(
      buildCaptureInput(buildRecognition({ packageSizeValue: 500, packageSizeUnit: 'g' })),
    )

    expect(result.readinessInput.productForm).toBe('granular')
  })

  it('4 — 1 l without form → liquid', () => {
    const result = evaluateCapturePath(
      buildCaptureInput(buildRecognition({ packageSizeValue: 1, packageSizeUnit: 'l' })),
    )

    expect(result.readinessInput.productForm).toBe('liquid')
  })

  it('5 — 500 ml without form → liquid', () => {
    const result = evaluateCapturePath(
      buildCaptureInput(buildRecognition({ packageSizeValue: 500, packageSizeUnit: 'ml' })),
    )

    expect(result.readinessInput.productForm).toBe('liquid')
  })

  it('6 — explicit liquid with kg unit → conflict, no silent override', () => {
    const input = buildCaptureInput(
      buildRecognition({ form: 'liquid', packageSizeValue: 5, packageSizeUnit: 'kg' }),
    )
    const prepared = stripInlineFormLine(input)
    const raw = buildRawFertilizerDeclarationInput(
      validateFertilizerEnrichmentOrchestrationInputForTests(prepared),
      [packagingAdapterWithUnknownForm(prepared)],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    expect(raw.productForm.value).toBeNull()
    expect(raw.productForm.conflictIds).toContain(PRODUCT_FORM_UNIT_CONFLICT_ID)
    expect(raw.sourceConflicts.some((conflict) => conflict.type === 'product_form_conflict')).toBe(
      true,
    )

    const result = evaluateRawFertilizerDeclaration(raw, {
      normalizedAt: FIXED_NOW,
      normalizationRunId: FIXED_NORM_ID,
      evaluatedAt: FIXED_EVAL,
    })

    expect(result.readinessResult.status).toBe('needs_input')
    expect(result.readinessResult.missingRequirements).toContain('basis.product_form')
    expect(result.readinessInput.blockingSourceConflict).toEqual({
      blocking: true,
      resolvable: true,
    })
  })

  it('7 — no form and no package unit → needs_input', () => {
    const recognition = buildRecognition({ packageSizeValue: 5, packageSizeUnit: 'kg' })
    recognition.recognition.packageSize = {
      rawValue: null,
      normalizedValue: null,
      unit: null,
      confidence: 0,
      source: null,
      evidence: null,
    }

    const input = buildCaptureInput(recognition)
    const basis = input.captureRecognitionPackagingBasis
    if (basis) {
      input.captureRecognitionPackagingBasis = {
        ...basis,
        packageSizeValue: null,
        packageSizeUnit: null,
      }
    }

    const result = evaluateCapturePath(input)

    expect(result.readinessResult.status).toBe('needs_input')
    expect(result.readinessResult.missingRequirements).toContain('basis.product_form')
  })

  it('8 — manufacturer no_match + packaging success + 5 kg → intake_ready', () => {
    const result = evaluateCapturePath(
      buildCaptureInput(buildRecognition({ packageSizeValue: 5, packageSizeUnit: 'kg' })),
    )

    expect(result.readinessResult.status).toBe('ready')
    expect(result.readinessResult.missingRequirements).not.toContain('basis.product_form')
    expect(result.readinessResult.missingRequirements).not.toContain('ingredients.matrix')
  })

  it('marks package-unit inferred form provenance internally', () => {
    const input = buildCaptureInput(buildRecognition({ packageSizeValue: 5, packageSizeUnit: 'kg' }))
    const prepared = stripInlineFormLine(input)
    const raw = buildRawFertilizerDeclarationInput(
      validateFertilizerEnrichmentOrchestrationInputForTests(prepared),
      [packagingAdapterWithUnknownForm(prepared)],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    const provenanceId = resolveCapturePackageUnitInferredFormProvenanceId(prepared)
    expect(raw.productForm.provenanceIds).toContain(provenanceId)
    expect(raw.provenanceRecords[provenanceId]?.fieldPath).toBe('basis.product_form')
    expect(raw.provenanceRecords[provenanceId]?.sourceTitle).toBe('Package unit inferred product form')
  })

  it('full path: recognition without form but 5 kg reaches intake_ready after JSON roundtrip', () => {
    const result = evaluateCapturePath(
      buildCaptureInput(buildRecognition({ packageSizeValue: 5, packageSizeUnit: 'kg' })),
    )

    expect(result.readinessResult.status).toBe('ready')
    expect(result.readinessInput.productForm).toBe('granular')
  })
})
