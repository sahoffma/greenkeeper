import { describe, expect, it } from 'vitest'
import {
  FERTILIZER_ENRICHMENT_CONFLICT_TYPES,
  FERTILIZER_CONFLICT_RESOLUTION_STATUSES,
  FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
  type FertilizerEnrichmentConflict,
} from './fertilizerEnrichment'
import {
  FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
  FERTILIZER_DECLARATION_NORMALIZATION_STATUSES,
  FERTILIZER_SOURCE_EVALUATION_STATUSES,
  RAW_FERTILIZER_DECLARATION_VALUE_STATUSES,
  type FertilizerDeclarationConflict,
  type FertilizerDeclarationNormalizationResult,
  type RawFertilizerDeclarationValue,
} from './fertilizerDeclarationNormalization'
import {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  FERTILIZER_READINESS_SPECIFICATION_VERSION,
} from './fertilizerReadiness'

describe('fertilizerDeclarationNormalization types', () => {
  it('exports the normalization specification version', () => {
    expect(FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION).toBe(
      'fertilizer-declaration-normalization-v1',
    )
  })

  it('keeps enrichment, normalization, and readiness versions separate', () => {
    expect(FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION).toBe('fertilizer-enrichment-v1')
    expect(FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION).toBe(
      'fertilizer-declaration-normalization-v1',
    )
    expect(FERTILIZER_READINESS_SPECIFICATION_VERSION).toBe('fertilizer-readiness-v1')

    const versions = new Set([
      FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
      FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
      FERTILIZER_READINESS_SPECIFICATION_VERSION,
    ])

    expect(versions.size).toBe(3)
  })

  it('lists all seven controlled conflict types', () => {
    expect(FERTILIZER_ENRICHMENT_CONFLICT_TYPES).toHaveLength(7)
    expect(FERTILIZER_ENRICHMENT_CONFLICT_TYPES).toContain('nutrient_value_conflict')
  })

  it('lists all controlled resolution statuses', () => {
    expect(FERTILIZER_CONFLICT_RESOLUTION_STATUSES).toEqual([
      'unresolved',
      'resolved_by_authoritative_source',
      'resolved_by_variant_match',
      'resolved_by_newer_official_version',
      'requires_user_input',
      'not_resolvable',
    ])
  })

  it('lists normalization and source-evaluation statuses', () => {
    expect(FERTILIZER_DECLARATION_NORMALIZATION_STATUSES).toEqual([
      'normalized',
      'partially_normalized',
      'blocked',
    ])
    expect(FERTILIZER_SOURCE_EVALUATION_STATUSES).toEqual([
      'not_started',
      'source_partial',
      'source_fully_evaluated',
    ])
  })

  it('reuses all 16 GM-009 v1 matrix keys without duplication', () => {
    expect(FERTILIZER_NUTRIENT_MATRIX_KEYS).toHaveLength(16)
    expect(new Set(FERTILIZER_NUTRIENT_MATRIX_KEYS).size).toBe(16)
  })

  it('separates not_declared from numeric zero at the type level', () => {
    const notDeclared: RawFertilizerDeclarationValue = {
      status: 'not_declared',
    }
    const declaredZero: RawFertilizerDeclarationValue = {
      status: 'declared',
      value: 0,
      declarationBasis: 'N',
    }

    expect(notDeclared.status).toBe('not_declared')
    expect(notDeclared.value).toBeUndefined()
    expect(declaredZero.value).toBe(0)
    expect(RAW_FERTILIZER_DECLARATION_VALUE_STATUSES).toContain('not_declared')
    expect(RAW_FERTILIZER_DECLARATION_VALUE_STATUSES).toContain('declared')
  })

  it('does not import recognition types in the normalization module', async () => {
    const source = await import('./fertilizerDeclarationNormalization?raw')

    expect(String(source.default)).not.toMatch(/ProductRecognize/)
  })

  it('requires full metadata on FertilizerDeclarationConflict', () => {
    const conflict: FertilizerDeclarationConflict = {
      conflictId: 'conflict-npk-1',
      type: 'npk_conflict',
      fieldPath: 'npk.nitrogen',
      sourceIds: ['prov-a', 'prov-b'],
      values: [
        { sourceId: 'prov-a', value: 15, declarationBasis: 'N' },
        { sourceId: 'prov-b', value: 16, declarationBasis: 'N' },
      ],
      blocking: true,
      resolvable: false,
      resolutionStatus: 'unresolved',
      reasonCode: 'npk_mismatch',
    }

    expect(conflict.conflictId).toBe('conflict-npk-1')
    expect(conflict.sourceIds).toHaveLength(2)
    expect(conflict.values).toHaveLength(2)
    expect(conflict.reasonCode).toBe('npk_mismatch')
  })

  it('keeps FertilizerEnrichmentConflict as a weaker Phase-1b contract', () => {
    const phase1bConflict: FertilizerEnrichmentConflict = {
      type: 'source_version_conflict',
      fieldPath: 'npk.nitrogen',
      blocking: false,
      resolvable: true,
      participantProvenanceIds: [],
    }

    expect(phase1bConflict.conflictId).toBeUndefined()
    expect(phase1bConflict.values).toBeUndefined()
    expect(phase1bConflict.resolutionStatus).toBeUndefined()
    expect(phase1bConflict.reasonCode).toBeUndefined()
  })

  it('stores conflicts canonically on enrichmentResult only', () => {
    const resultKeys = [
      'status',
      'enrichmentResult',
      'normalizationSpecificationVersion',
      'normalizedAt',
      'normalizationRunId',
    ] satisfies (keyof FertilizerDeclarationNormalizationResult)[]

    expect(resultKeys).not.toContain('conflicts')
    expect(resultKeys).not.toContain('provenance')
    expect(resultKeys).toHaveLength(5)

    const sample: FertilizerDeclarationNormalizationResult = {
      status: 'partially_normalized',
      normalizationSpecificationVersion: FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
      normalizedAt: '2026-07-29T12:00:00.000Z',
      normalizationRunId: 'norm-run-1',
      enrichmentResult: {
        objectCategory: 'fertilizer',
        specificationVersion: FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
        identity: {
          manufacturer: 'ICL',
          officialName: 'Spring Start',
          variant: '15-0-26',
          identityFingerprint: 'icl-spring-start',
          identityConfidence: 0.95,
          hasIdentityAmbiguity: false,
        },
        productForm: { value: 'granular' },
        npk: {
          nitrogen: 15,
          phosphate: 0,
          potash: 26,
          declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
        },
        nutrientMatrix: {} as FertilizerDeclarationNormalizationResult['enrichmentResult']['nutrientMatrix'],
        declarationEvaluation: { status: 'insufficient_sources' },
        sourceConflicts: [
          {
            conflictId: 'conflict-1',
            type: 'nutrient_value_conflict',
            fieldPath: 'nutrientMatrix.iron',
            sourceIds: ['prov-iron-a'],
            values: [{ sourceId: 'prov-iron-a', value: 1 }],
            blocking: false,
            resolvable: true,
            resolutionStatus: 'unresolved',
            reasonCode: 'matrix_mismatch',
          },
        ],
        enrichmentRunId: 'enrich-run-1',
        enrichedAt: '2026-07-29T11:00:00.000Z',
        normalizationRunId: 'norm-run-1',
        normalizedAt: '2026-07-29T12:00:00.000Z',
        normalizationStatus: 'partially_normalized',
        normalizationRulesVersion: FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
        provenanceRecords: {
          'prov-iron-a': {
            provenanceId: 'prov-iron-a',
            fieldPath: 'nutrientMatrix.iron',
            sourceType: 'product_document',
            sourceCategory: 'official_document',
            sourceUrl: null,
            sourceTitle: null,
            evidence: 'Fe 1%',
            retrievedAt: '2026-07-29T11:00:00.000Z',
            confidence: 0.9,
          },
        },
      },
    }

    expect(sample.enrichmentResult.sourceConflicts).toHaveLength(1)
    expect(sample.enrichmentResult.provenanceRecords['prov-iron-a'].fieldPath).toBe(
      'nutrientMatrix.iron',
    )
    expect(sample).not.toHaveProperty('conflicts')
    expect(sample).not.toHaveProperty('provenance')
  })
})
