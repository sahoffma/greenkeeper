import { describe, expect, it } from 'vitest'
import {
  buildEmptyFieldConfidenceRecord,
  buildImageAnalysisInstruction,
  parseImageAnalysisResponse,
  productRecognizeImageSchema,
} from './productRecognizeImageCore'
import { buildRecognitionPackageParseDiagnostics } from './productRecognizeImagePackageDiagnosticsCore'
import { GENERIC_LABEL_COMPOSITION_TEXT_FRAGMENTS } from './fertilizerCaptureNutrientTestFixtures'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import {
  acceptRecognitionResult,
  createInitialCaptureDraft,
  proceedToConfirm,
} from './fertilizerCaptureCore'
import {
  buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft,
} from './fertilizerCaptureEnrichmentInputCore'
import { validateFertilizerEnrichmentOrchestrationInputForTests } from './fertilizerEnrichmentServerServiceCore'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'
import {
  mapDeclarationParseToAdapterResult,
  parseUserProvidedDeclarationText,
} from './fertilizerUserProvidedSourceAdapterCore'
import { buildRawFertilizerDeclarationInput } from './fertilizerSourceAdapterMergeCore'
import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import type { ProductRecognizeResult } from '../types/productRecognize'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const FIXED_RUN_ID = 'contract-save-packaging-run'
const FIXED_NORM_ID = 'contract-save-packaging-norm'
const FIXED_EVAL = '2026-07-29T10:00:05.000Z'

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
  const serialized = JSON.stringify({ input, idempotencyKey: 'contract-save-key' })
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

function buildSchemaContractResponse(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    brand: 'PlantCo',
    productLine: null,
    productName: 'Boost',
    variant: null,
    productDescriptor: null,
    manufacturer: 'PlantCo',
    npkLabel: null,
    nitrogen: null,
    phosphate: null,
    potash: null,
    packageSizeValue: null,
    packageSizeUnit: null,
    form: null,
    gtin: null,
    textFragments: [],
    fieldConfidence: buildEmptyFieldConfidenceRecord(),
    ...overrides,
  }
}

function evaluateContractEndToEnd(record: Record<string, unknown>) {
  const analysis = parseImageAnalysisResponse(record)
  const diagnostics = buildRecognitionPackageParseDiagnostics({
    rawVisionJsonParsed: true,
    rawRecord: record,
    parsed: analysis,
  })
  const recognition = recognitionFromImageAnalysis(analysis)
  const result = {
    status: 'identified',
    identityConfidence: 1,
    dataCompleteness: 0.9,
    recognition,
    catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
    sources: [],
    missingRequiredFields: [],
    nextAction: { type: 'none', message: null },
    stockCapture: { allowed: true, recognitionCandidate: true, persistToCatalog: false, message: null },
    diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: [] },
    steps: [],
    spike: true,
  } satisfies ProductRecognizeResult

  let draft = acceptRecognitionResult(createInitialCaptureDraft(), result, {
    stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
  })
  draft = proceedToConfirm(draft)

  const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
    enrichmentIdempotencyKey: 'contract-key',
  })

  const serialized = JSON.stringify({ input })
  const roundtrip = JSON.parse(serialized) as { input: typeof input }
  validateFertilizerEnrichmentOrchestrationInputForTests(roundtrip.input)
  const readiness = evaluateCaptureSavePath(roundtrip.input)

  return { analysis, diagnostics, recognition, draft, input, readiness }
}

describe('productRecognizeImageSchema contract', () => {
  it('uses the same top-level property names in schema, parser and instruction', () => {
    const required = productRecognizeImageSchema.required
    expect(required).toContain('packageSizeValue')
    expect(required).toContain('packageSizeUnit')
    expect(required).not.toContain('packageSize')
    expect(required).not.toContain('package_size')

    const instruction = buildImageAnalysisInstruction()
    expect(instruction).toContain('packageSizeValue')
    expect(instruction).toContain('packageSizeUnit')
  })

  it('parses nested package object only when schema shape is bypassed', () => {
    const record = {
      ...buildSchemaContractResponse(),
      packageSize: { value: 5, unit: 'kg' },
    }

    const { analysis, diagnostics } = evaluateContractEndToEnd(record)

    expect(diagnostics.rawNestedPackageSizePresent).toBe(true)
    expect(diagnostics.rawTopLevelPackageSizeValuePresent).toBe(false)
    expect(diagnostics.packageSizeLossStage).toBe('none')
    expect(analysis.packageSizeValue).toBe(5)
    expect(analysis.packageSizeUnit).toBe('kg')
  })

  it('parses numeric packageSizeValue from schema contract', () => {
    const record = buildSchemaContractResponse({
      productName: 'Stress-Manager',
      manufacturer: 'Rasendoktor',
      brand: 'Rasendoktor',
      npkLabel: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: 5,
      packageSizeUnit: 'kg',
      fieldConfidence: { ...buildEmptyFieldConfidenceRecord(), packageSize: 0.92, npk: 0.9 },
      textFragments: [...GENERIC_LABEL_COMPOSITION_TEXT_FRAGMENTS],
    })

    const { analysis, diagnostics, draft, input, readiness } = evaluateContractEndToEnd(record)

    expect(diagnostics.rawPackageSizeValueType).toBe('number')
    expect(diagnostics.parsedPackageSizeValuePresent).toBe(true)
    expect(diagnostics.packageSizeLossStage).toBe('none')
    expect(analysis.packageSizeValue).toBe(5)
    expect(draft.selectedPackageQuantity).toBe(5)
    expect(draft.selectedPackageUnit).toBe('kg')
    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
    expect(readiness.readinessResult.status).toBe('ready')
    expect(readiness.readinessInput.productForm).toBe('granular')
  })

  it('parses string packageSizeValue when present in raw JSON', () => {
    const record = buildSchemaContractResponse({
      packageSizeValue: '5',
      packageSizeUnit: 'kg',
    })

    const { analysis, diagnostics } = evaluateContractEndToEnd(record)

    expect(diagnostics.rawPackageSizeValueType).toBe('string')
    expect(diagnostics.parsedPackageSizeValuePresent).toBe(true)
    expect(analysis.packageSizeValue).toBe(5)
  })

  it('extracts package size from OCR textFragments when structured fields are null', () => {
    const record = buildSchemaContractResponse({
      textFragments: ['Rasendünger', 'Nettoinhalt 5 kg', '0-0-30'],
    })

    const { analysis, diagnostics, draft, input } = evaluateContractEndToEnd(record)

    expect(diagnostics.rawTopLevelPackageSizeValuePresent).toBe(false)
    expect(diagnostics.packageSizeLossStage).toBe('none')
    expect(analysis.packageSizeValue).toBe(5)
    expect(analysis.packageSizeUnit).toBe('kg')
    expect(draft.selectedPackageQuantity).toBe(5)
    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBe(5)
  })

  it('reports vision_missing when no structured or OCR package signal exists', () => {
    const record = buildSchemaContractResponse({
      textFragments: ['Rasendünger', '0-0-30'],
    })

    const { analysis, diagnostics, draft, input } = evaluateContractEndToEnd(record)

    expect(analysis.packageSizeValue).toBeNull()
    expect(diagnostics.packageSizeLossStage).toBe('vision_missing')
    expect(draft.selectedPackageQuantity).toBeNull()
    expect(input.captureRecognitionPackagingBasis?.packageSizeValue).toBeNull()
  })

  it('reports schema_validation when alternate nested keys are not mapped', () => {
    const record = {
      ...buildSchemaContractResponse(),
      packageSize: { label: '5 kg' },
    }

    const analysis = parseImageAnalysisResponse(record)
    const diagnostics = buildRecognitionPackageParseDiagnostics({
      rawVisionJsonParsed: true,
      rawRecord: record,
      parsed: analysis,
    })

    expect(diagnostics.rawNestedPackageSizePresent).toBe(true)
    expect(analysis.packageSizeValue).toBeNull()
    expect(diagnostics.packageSizeLossStage).toBe('schema_validation')
  })
})
