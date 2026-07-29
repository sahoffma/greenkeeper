import { describe, expect, it } from 'vitest'
import {
  aggregateBlockingSourceConflict,
  buildFertilizerReadinessInput,
  mapEnrichmentNutrientEntryToReadiness,
} from './fertilizerReadinessInputBuilderCore'
import { evaluateFertilizerReadiness } from './fertilizerReadinessCore'
import {
  FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
  type FertilizerEnrichmentConflict,
  type FertilizerEnrichmentNutrientEntry,
  type FertilizerEnrichmentNutrientMatrix,
  type FertilizerEnrichmentResult,
} from '../types/fertilizerEnrichment'
import {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  FERTILIZER_READINESS_SPECIFICATION_VERSION,
} from '../types/fertilizerReadiness'

function nutrientEntry(
  value: number | null | undefined,
  overrides: Partial<FertilizerEnrichmentNutrientEntry> = {},
): FertilizerEnrichmentNutrientEntry {
  return {
    value,
    declarationBasis: overrides.declarationBasis ?? 'N',
    unit: '%',
    normalization: overrides.normalization ?? 'declared',
    provenanceId: overrides.provenanceId ?? 'prov-1',
    evidence: overrides.evidence ?? 'label',
    sourceUrl: overrides.sourceUrl ?? null,
    sourceCategory: overrides.sourceCategory ?? 'official_manufacturer',
    confidence: overrides.confidence ?? 0.9,
    conflictStatus: overrides.conflictStatus ?? 'none',
    ...overrides,
  }
}

function fullEnrichmentMatrix(
  overrides: Partial<FertilizerEnrichmentNutrientMatrix> = {},
): FertilizerEnrichmentNutrientMatrix {
  const base = Object.fromEntries(
    FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => {
      const basis =
        key === 'phosphate' ? 'P2O5' : key === 'potash' ? 'K2O' : key === 'magnesium' ? 'MgO' : key === 'calcium' ? 'CaO' : key === 'sulfur' ? 'SO3' : key.startsWith('nitrate') || key.includes('Nitrogen') || key === 'nitrogen' ? 'N' : key === 'iron' ? 'Fe' : key === 'manganese' ? 'Mn' : key === 'copper' ? 'Cu' : key === 'zinc' ? 'Zn' : key === 'boron' ? 'B' : 'Mo'
      const value =
        key === 'nitrogen' ? 15 : key === 'potash' ? 26 : key === 'magnesium' ? 2 : key === 'nitrateNitrogen' ? 5 : key === 'ammoniumNitrogen' ? 5 : key === 'ureaNitrogen' ? 5 : 0
      return [key, nutrientEntry(value, { declarationBasis: basis })]
    }),
  ) as FertilizerEnrichmentNutrientMatrix

  return { ...base, ...overrides }
}

function buildEnrichmentResult(
  overrides: Partial<FertilizerEnrichmentResult> = {},
): FertilizerEnrichmentResult {
  return {
    objectCategory: 'fertilizer',
    specificationVersion: FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
    identity: {
      manufacturer: 'ICL',
      officialName: 'Spring Start',
      productLine: 'Professional',
      variant: '15-0-26',
      identityFingerprint: 'icl-spring-start',
      identityConfidence: 0.95,
      hasIdentityAmbiguity: false,
      identityAmbiguityCandidateCount: 1,
    },
    productForm: {
      value: 'granular',
      provenanceId: 'prov-form',
    },
    npk: {
      nitrogen: 15,
      phosphate: 0,
      potash: 26,
      declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
    },
    nutrientMatrix: fullEnrichmentMatrix(),
    declarationEvaluation: {
      status: 'fully_evaluated',
      evaluatedSourceIds: ['prov-1'],
      variantResolved: true,
      productScopeConfirmed: true,
    },
    sourceConflicts: [],
    application: {
      recommendedRateMin: 20,
      recommendedRateMax: 30,
      rateUnit: 'g/m²',
    },
    enrichmentRunId: 'enr-1',
    enrichedAt: '2026-07-29T12:00:00.000Z',
    ...overrides,
  }
}

describe('buildFertilizerReadinessInput', () => {
  it('uses fertilizer-enrichment-v1 on enrichment and keeps readiness version separate', () => {
    const enrichment = buildEnrichmentResult()

    expect(enrichment.specificationVersion).toBe(FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION)
    expect(enrichment.specificationVersion).not.toBe(FERTILIZER_READINESS_SPECIFICATION_VERSION)

    const input = buildFertilizerReadinessInput(enrichment)

    expect(input).not.toHaveProperty('specificationVersion')

    const readiness = evaluateFertilizerReadiness(input, {
      evaluatedAt: '2026-07-29T12:00:00.000Z',
    })

    expect(readiness.specificationVersion).toBe(FERTILIZER_READINESS_SPECIFICATION_VERSION)
    expect(readiness.specificationVersion).not.toBe(enrichment.specificationVersion)
  })

  it('maps a fully structured enrichment result to readiness input', () => {
    const enrichment = buildEnrichmentResult()
    const input = buildFertilizerReadinessInput(enrichment)

    expect(input.objectCategory).toBe('fertilizer')
    expect(input.identity.manufacturer).toBe('ICL')
    expect(input.identity.officialName).toBe('Spring Start')
    expect(input.identity.variant).toBe('15-0-26')
    expect(input.identity.identityFingerprint).toBe('icl-spring-start')
    expect(input.identity.identityAmbiguity.isAmbiguous).toBe(false)
    expect(input.productForm).toBe('granular')
    expect(input.npk).toEqual({
      nitrogen: 15,
      phosphate: 0,
      potash: 26,
      declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
    })
    expect(input.declarationEvaluation.status).toBe('fully_evaluated')
    expect(input.blockingSourceConflict).toBeNull()

    for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
      expect(input.nutrientMatrix[key]).toBeDefined()
      expect(input.nutrientMatrix[key]?.unit).toBe('%')
    }
  })

  it('does not set missing matrix values to 0 when fully_evaluated', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        declarationEvaluation: { status: 'fully_evaluated' },
        nutrientMatrix: fullEnrichmentMatrix({ iron: undefined }),
      }),
    )

    expect(input.nutrientMatrix.iron).toBeUndefined()
  })

  it('passes through existing dl014_zero without creating normalization', () => {
    const enrichment = buildEnrichmentResult({
      nutrientMatrix: fullEnrichmentMatrix({
        iron: nutrientEntry(0, { normalization: 'dl014_zero', declarationBasis: 'Fe' }),
      }),
    })

    const input = buildFertilizerReadinessInput(enrichment)

    expect(input.nutrientMatrix.iron).toEqual({
      value: 0,
      unit: '%',
      declarationBasis: 'Fe',
    })
    expect(enrichment.nutrientMatrix.iron?.normalization).toBe('dl014_zero')
  })

  it('preserves zero NPK and matrix values exactly', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        npk: {
          nitrogen: 0,
          phosphate: 0,
          potash: 30,
          declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
        },
        nutrientMatrix: fullEnrichmentMatrix({
          nitrogen: nutrientEntry(0, { declarationBasis: 'N' }),
          phosphate: nutrientEntry(0, { declarationBasis: 'P2O5' }),
          potash: nutrientEntry(30, { declarationBasis: 'K2O' }),
          boron: nutrientEntry(0, { declarationBasis: 'B' }),
        }),
      }),
    )

    expect(input.npk.nitrogen).toBe(0)
    expect(input.npk.phosphate).toBe(0)
    expect(input.npk.potash).toBe(30)
    expect(input.nutrientMatrix.boron?.value).toBe(0)
  })

  it('preserves null without converting to 0', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        npk: {
          nitrogen: null,
          phosphate: 0,
          potash: 26,
          declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
        },
        nutrientMatrix: fullEnrichmentMatrix({
          iron: nutrientEntry(null, { declarationBasis: 'Fe' }),
        }),
      }),
    )

    expect(input.npk.nitrogen).toBeNull()
    expect(input.nutrientMatrix.iron).toBeNull()
  })

  it('preserves undefined without conversion or removal', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        npk: {
          nitrogen: undefined,
          phosphate: 0,
          potash: 26,
          declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
        },
        nutrientMatrix: fullEnrichmentMatrix({
          zinc: undefined,
        }),
      }),
    )

    expect(input.npk.nitrogen).toBeUndefined()
    expect(input.nutrientMatrix.zinc).toBeUndefined()
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative', -1],
  ] as const)('does not correct invalid numeric value %s', (_label, value) => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        npk: {
          nitrogen: value,
          phosphate: 0,
          potash: 26,
          declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
        },
        nutrientMatrix: fullEnrichmentMatrix({
          copper: nutrientEntry(value, { declarationBasis: 'Cu' }),
        }),
      }),
    )

    expect(input.npk.nitrogen).toBe(value)
    expect(input.nutrientMatrix.copper?.value).toBe(value)
  })

  it.each([
    ['not_started', 'not_started'],
    ['insufficient_sources', 'insufficient_sources'],
    ['fully_evaluated', 'fully_evaluated'],
  ] as const)('maps declaration status %s unchanged', (status, expected) => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        declarationEvaluation: { status },
      }),
    )

    expect(input.declarationEvaluation.status).toBe(expected)
  })

  it('aggregates a blocking resolvable conflict', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        sourceConflicts: [
          {
            type: 'npk_conflict',
            fieldPath: 'npk.nitrogen',
            blocking: true,
            resolvable: true,
            participantProvenanceIds: ['a', 'b'],
          },
        ],
      }),
    )

    expect(input.blockingSourceConflict).toEqual({ blocking: true, resolvable: true })
  })

  it('aggregates a blocking unresolvable conflict', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        sourceConflicts: [
          {
            type: 'nutrient_value_conflict',
            fieldPath: 'nutrientMatrix.iron',
            blocking: true,
            resolvable: false,
            participantProvenanceIds: ['a', 'b'],
          },
        ],
      }),
    )

    expect(input.blockingSourceConflict).toEqual({ blocking: true, resolvable: false })
  })

  it('ignores non-blocking conflicts', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        sourceConflicts: [
          {
            type: 'source_version_conflict',
            fieldPath: 'npk.potash',
            blocking: false,
            resolvable: true,
            participantProvenanceIds: ['a'],
          },
        ],
      }),
    )

    expect(input.blockingSourceConflict).toBeNull()
  })

  it('prefers unresolvable when mixing blocking conflicts', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        sourceConflicts: [
          {
            type: 'npk_conflict',
            fieldPath: 'npk.nitrogen',
            blocking: true,
            resolvable: true,
            participantProvenanceIds: ['a'],
          },
          {
            type: 'variant_conflict',
            fieldPath: 'identity.variant',
            blocking: true,
            resolvable: false,
            participantProvenanceIds: ['b'],
          },
          {
            type: 'source_version_conflict',
            fieldPath: 'npk.potash',
            blocking: false,
            resolvable: true,
            participantProvenanceIds: ['c'],
          },
        ],
      }),
    )

    expect(input.blockingSourceConflict).toEqual({ blocking: true, resolvable: false })
  })

  it('passes through non-fertilizer objectCategory without throwing', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        objectCategory: 'tool',
      }),
    )

    expect(input.objectCategory).toBe('tool')
  })

  it('does not include application data in readiness input', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        application: {
          recommendedRateMin: 10,
          recommendedRateMax: 20,
          rateUnit: 'g/m²',
        },
      }),
    )

    expect(input).not.toHaveProperty('application')
  })

  it('maps identity ambiguity flags without interpreting confidence', () => {
    const input = buildFertilizerReadinessInput(
      buildEnrichmentResult({
        identity: {
          manufacturer: 'ICL',
          officialName: 'Spring Start',
          variant: null,
          identityFingerprint: 'fp',
          identityConfidence: 0.4,
          hasIdentityAmbiguity: true,
          identityAmbiguityResolvable: true,
          identityNotActionable: false,
          identityAmbiguityCandidateCount: 2,
          identityAmbiguityConflictReason: 'variant_collision',
        },
      }),
    )

    expect(input.identity.identityConfidence).toBe(0.4)
    expect(input.identity.identityAmbiguity).toEqual({
      isAmbiguous: true,
      candidateCount: 2,
      conflictReason: 'variant_collision',
    })
    expect(input.identity.identityAmbiguityResolvable).toBe(true)
  })
})

describe('mapEnrichmentNutrientEntryToReadiness', () => {
  it('does not alter normalization metadata in readiness output', () => {
    const entry = nutrientEntry(0, { normalization: 'dl014_zero' })
    const mapped = mapEnrichmentNutrientEntryToReadiness(entry)

    expect(mapped).toEqual({ value: 0, unit: '%', declarationBasis: 'N' })
    expect(entry.normalization).toBe('dl014_zero')
  })
})

describe('aggregateBlockingSourceConflict', () => {
  it('returns null when no blocking conflicts exist', () => {
    const conflicts: FertilizerEnrichmentConflict[] = [
      {
        type: 'source_version_conflict',
        fieldPath: 'npk.nitrogen',
        blocking: false,
        resolvable: true,
        participantProvenanceIds: [],
      },
    ]

    expect(aggregateBlockingSourceConflict(conflicts)).toBeNull()
  })
})

describe('FertilizerEnrichmentResult provenance', () => {
  it('keeps provenance on enrichment entries without leaking into readiness matrix', () => {
    const enrichment = buildEnrichmentResult({
      nutrientMatrix: fullEnrichmentMatrix({
        iron: nutrientEntry(1, {
          declarationBasis: 'Fe',
          provenanceId: 'prov-iron',
          evidence: 'datasheet row 4',
          sourceUrl: 'https://example.com/sheet.pdf',
        }),
      }),
    })

    expect(enrichment.nutrientMatrix.iron?.provenanceId).toBe('prov-iron')

    const input = buildFertilizerReadinessInput(enrichment)

    expect(input.nutrientMatrix.iron).toEqual({
      value: 1,
      unit: '%',
      declarationBasis: 'Fe',
    })
    expect(input.nutrientMatrix.iron).not.toHaveProperty('provenanceId')
  })
})
