import { describe, expect, it } from 'vitest'
import type { FertilizerSourceAdapterResult } from '../types/fertilizerEnrichmentOrchestration'
import { buildFertilizerReadinessInput } from './fertilizerReadinessInputBuilderCore'
import { evaluateFertilizerReadiness } from './fertilizerReadinessCore'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'
import { buildRawFertilizerDeclarationInput } from './fertilizerSourceAdapterMergeCore'
import { buildFertilizerSourceProvenanceReadinessDiagnostic } from './fertilizerSourceProvenanceReadinessDiagnosticCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const FIXED_RUN_ID = 'merge-test-run'
const FIXED_NORM_ID = 'merge-test-norm'

const IDENTITY = {
  manufacturer: 'Rasendoktor',
  officialName: 'Stress-Manager',
  productLine: 'Professional',
  variant: '0-0-30',
  identityFingerprint: 'fp',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
}

function manufacturerStructuredAdapter(
  overrides: Partial<Extract<FertilizerSourceAdapterResult, { status: 'success' }>> = {},
): Extract<FertilizerSourceAdapterResult, { status: 'success' }> {
  return {
    adapterType: 'manufacturer_product_page',
    status: 'success',
    sourceId: 'manufacturer-web-search:https://example.test/stress-manager',
    sourceType: 'web_search',
    sourceCategory: 'official_document',
    sourceUrl: 'https://example.test/stress-manager',
    sourceTitle: 'Official product page',
    retrievedAt: FIXED_NOW,
    productVariantReference: '0-0-30',
    extraction: {
      extractedProductForm: 'granular',
      extractedNpk: {
        nitrogen: 0,
        phosphate: 0,
        potash: 30,
        declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
      },
      extractedNutrients: [
        { key: 'potash', value: 30, declarationBasis: 'K2O', unit: '%' },
        { key: 'sulfur', value: 10.2, declarationBasis: 'S', unit: '%' },
        { key: 'iron', value: 3, declarationBasis: 'Fe', unit: '%' },
        { key: 'copper', value: 0.1, declarationBasis: 'Cu', unit: '%' },
      ],
      coverageMetadata: {
        fieldsCovered: ['npk', 'potash', 'sulfur', 'iron', 'copper'],
        nutrientSectionLocated: true,
        nutrientSectionFullyCaptured: true,
        variantMatched: true,
        productScopeConfirmed: true,
      },
    },
    ...overrides,
  }
}

function packagingPartialAdapter(
  overrides: Partial<Extract<FertilizerSourceAdapterResult, { status: 'partial' }>> = {},
): Extract<FertilizerSourceAdapterResult, { status: 'partial' }> {
  return {
    adapterType: 'packaging',
    status: 'partial',
    sourceId: 'packaging:front-label',
    sourceType: 'packaging_label_text',
    sourceCategory: 'packaging_evidence',
    sourceRef: 'front-label',
    retrievedAt: FIXED_NOW,
    productVariantReference: 'Stressmanager',
    extraction: {
      extractedNpk: {
        nitrogen: 0,
        phosphate: 0,
        potash: 30,
        declarationBasis: null,
      },
      extractedNutrients: [{ key: 'magnesium', value: 11, declarationBasis: 'MgO', unit: '%' }],
      coverageMetadata: {
        fieldsCovered: ['npk', 'nutrientMatrix.magnesium'],
        nutrientSectionLocated: true,
        nutrientSectionFullyCaptured: false,
        variantMatched: false,
        productScopeConfirmed: true,
      },
    },
    ...overrides,
  }
}

describe('fertilizerSourceAdapterMergeCore', () => {
  it('accepts structured web_search as official declaration source', () => {
    const raw = buildRawFertilizerDeclarationInput(
      {
        objectCategory: 'fertilizer',
        identity: IDENTITY,
        allowedInputChannels: ['capture_flow'],
        captureRecognitionPackagingBasis: {
          sourceId: 'capture-packaging-basis',
          manufacturer: IDENTITY.manufacturer,
          officialName: IDENTITY.officialName,
          productLine: IDENTITY.productLine,
          variant: IDENTITY.variant,
          productForm: 'granular',
          npk: { nitrogen: 0, phosphate: 0, potash: 30 },
        },
      },
      [manufacturerStructuredAdapter()],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    const diagnostic = buildFertilizerSourceProvenanceReadinessDiagnostic({
      rawDeclarationInput: raw,
      adapterOutcomes: [{ adapterType: 'manufacturer_product_page', status: 'success' }],
    })

    expect(raw.coverageMetadata.nutrientSectionFullyCaptured).toBe(true)
    expect(diagnostic.declarationSourceIdPresent).toBe(true)
    expect(diagnostic.declarationSourceOfficial).toBe(true)
    expect(diagnostic.declarationSourceType).toBe('manufacturer_page')
    expect(diagnostic.structuredDeclarationSourceAccepted).toBe(true)
  })

  it('does not create conflicts for identical npk values from packaging and manufacturer', () => {
    const raw = buildRawFertilizerDeclarationInput(
      {
        objectCategory: 'fertilizer',
        identity: IDENTITY,
        allowedInputChannels: ['capture_flow'],
      },
      [manufacturerStructuredAdapter(), packagingPartialAdapter()],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    expect(raw.sourceConflicts.filter((conflict) => conflict.blocking)).toHaveLength(0)
    expect(raw.npk.potash?.value).toBe(30)
  })

  it('lets validated official manufacturer win over partial packaging and reach intake_ready', () => {
    const raw = buildRawFertilizerDeclarationInput(
      {
        objectCategory: 'fertilizer',
        identity: IDENTITY,
        allowedInputChannels: ['capture_flow'],
        captureRecognitionPackagingBasis: {
          sourceId: 'capture-packaging-basis',
          manufacturer: IDENTITY.manufacturer,
          officialName: IDENTITY.officialName,
          productLine: IDENTITY.productLine,
          variant: IDENTITY.variant,
          productForm: 'granular',
          npk: { nitrogen: 0, phosphate: 0, potash: 30 },
        },
      },
      [manufacturerStructuredAdapter(), packagingPartialAdapter()],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    const pipeline = evaluateRawFertilizerDeclaration(raw, {
      normalizedAt: FIXED_NOW,
      normalizationRunId: FIXED_NORM_ID,
      evaluatedAt: FIXED_NOW,
    })

    const readiness = evaluateFertilizerReadiness(
      buildFertilizerReadinessInput(pipeline.normalizationResult.enrichmentResult),
      { automaticResearchAttempted: true },
    )

    expect(raw.sourceConflicts.filter((conflict) => conflict.blocking)).toHaveLength(0)
    expect(pipeline.normalizationResult.enrichmentResult.declarationEvaluation.status).toBe(
      'fully_evaluated',
    )
    expect(readiness.status).toBe('ready')
    expect(readiness.missingRequirements).not.toContain('ingredients.declaration_source')
    expect(readiness.missingRequirements).not.toContain('sources.conflict')
    expect(readiness.suggestedInputActions).not.toContain('capture_additional_packaging_photo')
  })

  it('keeps manufacturer values when packaging reports a conflicting nutrient', () => {
    const raw = buildRawFertilizerDeclarationInput(
      {
        objectCategory: 'fertilizer',
        identity: IDENTITY,
        allowedInputChannels: ['capture_flow'],
      },
      [
        manufacturerStructuredAdapter(),
        packagingPartialAdapter({
          extraction: {
            extractedNutrients: [{ key: 'iron', value: 0, declarationBasis: 'Fe', unit: '%' }],
            coverageMetadata: {
              fieldsCovered: ['nutrientMatrix.iron'],
              nutrientSectionLocated: true,
              nutrientSectionFullyCaptured: false,
              variantMatched: false,
              productScopeConfirmed: true,
            },
          },
        }),
      ],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    expect(raw.nutrientMatrix.iron?.value).toBe(3)
    expect(raw.sourceConflicts.filter((conflict) => conflict.blocking)).toHaveLength(0)
  })

  it('preserves matrix provenance on the official declaration source id', () => {
    const raw = buildRawFertilizerDeclarationInput(
      {
        objectCategory: 'fertilizer',
        identity: IDENTITY,
        allowedInputChannels: ['capture_flow'],
      },
      [manufacturerStructuredAdapter()],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    const declarationSourceId = 'manufacturer-web-search:https://example.test/stress-manager'

    expect(raw.npk.potash?.provenanceIds?.[0]).toBe(declarationSourceId)
    expect(raw.nutrientMatrix.iron?.provenanceIds?.[0]).toBe(declarationSourceId)

    const diagnostic = buildFertilizerSourceProvenanceReadinessDiagnostic({
      rawDeclarationInput: raw,
      adapterOutcomes: [{ adapterType: 'manufacturer_product_page', status: 'success' }],
    })

    expect(diagnostic.nutrientMatrixSourceMatchesDeclarationSource).toBe(true)
  })
})
