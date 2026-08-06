import { describe, expect, it } from 'vitest'
import { buildFertilizerCaptureNutrientPipelineDiagnostics } from './fertilizerCaptureNutrientPipelineDiagnosticsCore'

describe('fertilizerCaptureNutrientPipelineDiagnosticsCore', () => {
  it('reports packaging_parser when label text contains nutrients but adapter extracts none', () => {
    const diagnostics = buildFertilizerCaptureNutrientPipelineDiagnostics({
      visionAnalysis: { nitrogen: 0, phosphate: 0, potash: 30 },
      packagingDeclarationText: [
        'Product: Example',
        'Zusammensetzung: 3,0 % Eisen (Fe), 10,2 % Schwefel (S), 30 % Kaliumoxid (K2O)',
      ].join('\n'),
      adapterResults: [],
      rawDeclarationInput: null,
      normalizedNutrientMatrix: null,
    })

    expect(diagnostics.packagingTextNutrientCandidateCount).toBeGreaterThan(0)
    expect(diagnostics.packagingAdapterNutrientCount).toBe(0)
    expect(diagnostics.nutrientLossStage).toBe('packaging_parser')
  })

  it('reports none when positive nutrients survive merge and normalization', () => {
    const diagnostics = buildFertilizerCaptureNutrientPipelineDiagnostics({
      visionAnalysis: { nitrogen: 0, phosphate: 0, potash: 30 },
      packagingDeclarationText: 'Product: Example\nIron (Fe): 3%\nSulfur (S): 10.2%',
      adapterResults: [
        {
          adapterType: 'packaging',
          status: 'partial',
          sourceId: 'packaging-1',
          sourceType: 'packaging_label_text',
          sourceCategory: 'packaging_evidence',
          sourceRef: 'ref',
          sourceTitle: null,
          retrievedAt: '2026-01-01T00:00:00.000Z',
          sourceVersion: null,
          productVariantReference: null,
          extraction: {
            extractedNutrients: [
              { key: 'iron', value: 3, declarationBasis: 'Fe', unit: '%' },
              { key: 'sulfur', value: 10.2, declarationBasis: 'S', unit: '%' },
            ],
          },
        },
      ],
      rawDeclarationInput: null,
      normalizedNutrientMatrix: {
        iron: {
          value: 3,
          unit: '%',
          declarationBasis: 'Fe',
          normalization: 'declared',
          provenanceId: 'p1',
          evidence: null,
          sourceUrl: null,
          sourceCategory: 'packaging_evidence',
          confidence: null,
          conflictStatus: 'none',
        },
        sulfur: {
          value: 10.2,
          unit: '%',
          declarationBasis: 'S',
          normalization: 'declared',
          provenanceId: 'p1',
          evidence: null,
          sourceUrl: null,
          sourceCategory: 'packaging_evidence',
          confidence: null,
          conflictStatus: 'none',
        },
      } as never,
    })

    expect(diagnostics.positiveNutrientCountAfterZeroFill).toBe(2)
    expect(diagnostics.positiveNutrientLostDuringZeroFill).toBe(0)
    expect(diagnostics.nutrientLossStage).toBe('none')
  })
})
