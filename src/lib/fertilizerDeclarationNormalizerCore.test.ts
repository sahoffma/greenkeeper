import { describe, expect, it } from 'vitest'
import { FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION } from '../types/fertilizerEnrichment'
import {
  FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  type FertilizerDeclarationConflict,
  type RawFertilizerDeclarationInput,
  type RawFertilizerDeclarationValue,
} from '../types/fertilizerDeclarationNormalization'
import { FERTILIZER_READINESS_SPECIFICATION_VERSION } from '../types/fertilizerReadiness'
import {
  deriveDeclarationEvaluationStatus,
  FertilizerDeclarationNormalizationContractError,
  normalizeFertilizerDeclaration,
} from './fertilizerDeclarationNormalizerCore'
import { evaluateFertilizerReadiness } from './fertilizerReadinessCore'

const FIXED_NORMALIZED_AT = '2026-07-29T12:00:00.000Z'
const FIXED_RUN_ID = 'norm-run-test'

function rawDeclared(value: number, overrides: Partial<RawFertilizerDeclarationValue> = {}): RawFertilizerDeclarationValue {
  return {
    status: 'declared',
    value,
    declarationBasis: overrides.declarationBasis,
    provenanceIds: overrides.provenanceIds ?? ['prov-decl'],
    ...overrides,
  }
}

function rawNotDeclared(overrides: Partial<RawFertilizerDeclarationValue> = {}): RawFertilizerDeclarationValue {
  return {
    status: 'not_declared',
    provenanceIds: overrides.provenanceIds ?? ['prov-decl'],
    declarationBasis: overrides.declarationBasis,
    ...overrides,
  }
}

function fullCoverage(
  overrides: Partial<RawFertilizerDeclarationInput['coverageMetadata']> = {},
): RawFertilizerDeclarationInput['coverageMetadata'] {
  return {
    sourceEvaluationStatus: 'source_fully_evaluated',
    evaluatedSourceIds: ['prov-decl'],
    productScopeConfirmed: true,
    variantMatched: true,
    nutrientSectionLocated: true,
    nutrientSectionFullyCaptured: true,
    declarationBasisResolved: true,
    hasBlockingDeclarationConflict: false,
    ...overrides,
  }
}

function defaultBasisForKey(key: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number]): string {
  switch (key) {
    case 'phosphate':
      return 'P2O5'
    case 'potash':
      return 'K2O'
    case 'magnesium':
      return 'MgO'
    case 'calcium':
      return 'CaO'
    case 'sulfur':
      return 'SO3'
    case 'iron':
      return 'Fe'
    case 'manganese':
      return 'Mn'
    case 'copper':
      return 'Cu'
    case 'zinc':
      return 'Zn'
    case 'boron':
      return 'B'
    case 'molybdenum':
      return 'Mo'
    default:
      return 'N'
  }
}

function defaultValueForKey(key: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number]): number {
  if (key === 'nitrogen') return 15
  if (key === 'potash') return 26
  if (key === 'magnesium') return 2
  if (key === 'nitrateNitrogen') return 5
  if (key === 'ammoniumNitrogen') return 5
  if (key === 'ureaNitrogen') return 5
  return 0
}

function buildNormalizableRawInput(
  overrides: Partial<RawFertilizerDeclarationInput> = {},
): RawFertilizerDeclarationInput {
  const nutrientMatrix = Object.fromEntries(
    FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [
      key,
      rawDeclared(defaultValueForKey(key), {
        declarationBasis: defaultBasisForKey(key),
      }),
    ]),
  ) as RawFertilizerDeclarationInput['nutrientMatrix']

  return {
    objectCategory: 'fertilizer',
    identity: {
      manufacturer: 'ICL',
      officialName: 'Spring Start',
      productLine: 'Professional',
      variant: '15-0-26',
      identityFingerprint: 'icl-spring-start',
      identityConfidence: 0.95,
      hasIdentityAmbiguity: false,
    },
    productForm: { value: 'granular' },
    npk: {
      nitrogen: rawDeclared(15, { declarationBasis: 'N' }),
      phosphate: rawDeclared(0, { declarationBasis: 'P2O5' }),
      potash: rawDeclared(26, { declarationBasis: 'K2O' }),
      declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
    },
    nutrientMatrix,
    coverageMetadata: fullCoverage(),
    provenanceRecords: {
      'prov-decl': {
        provenanceId: 'prov-decl',
        fieldPath: 'nutrientMatrix.nitrogen',
        sourceType: 'product_document',
        sourceCategory: 'official_document',
        sourceUrl: 'https://example.com/sheet.pdf',
        sourceTitle: 'Datasheet',
        evidence: 'N 15%',
        retrievedAt: '2026-07-29T10:00:00.000Z',
        confidence: 0.95,
        isPrimary: true,
      },
    },
    sourceConflicts: [],
    enrichmentRunId: 'enrich-run-1',
    extractedAt: '2026-07-29T11:00:00.000Z',
    ...overrides,
  }
}

function normalize(
  input: RawFertilizerDeclarationInput,
  overrides: { normalizedAt?: string; normalizationRunId?: string } = {},
) {
  return normalizeFertilizerDeclaration(input, {
    normalizedAt: FIXED_NORMALIZED_AT,
    normalizationRunId: FIXED_RUN_ID,
    ...overrides,
  })
}

describe('normalizeFertilizerDeclaration', () => {
  it('N-1: declared value is preserved with normalization declared', () => {
    const result = normalize(buildNormalizableRawInput())

    expect(result.enrichmentResult.nutrientMatrix.iron?.value).toBe(0)
    expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('declared')
    expect(result.enrichmentResult.nutrientMatrix.nitrogen?.normalization).toBe('declared')
    expect(result.enrichmentResult.nutrientMatrix.nitrogen?.value).toBe(15)
  })

  it('N-2: not_declared under fully_evaluated becomes dl014_zero', () => {
    const input = buildNormalizableRawInput({
      nutrientMatrix: {
        ...buildNormalizableRawInput().nutrientMatrix,
        iron: rawNotDeclared({ declarationBasis: 'Fe' }),
      },
    })

    const result = normalize(input)

    expect(result.enrichmentResult.nutrientMatrix.iron?.value).toBe(0)
    expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('dl014_zero')
    expect(result.enrichmentResult.nutrientMatrix.iron?.provenanceId).toBe('prov-decl')
  })

  it('N-3: not_declared without fully_evaluated does not become zero', () => {
    const input = buildNormalizableRawInput({
      coverageMetadata: fullCoverage({ sourceEvaluationStatus: 'source_partial' }),
      nutrientMatrix: {
        ...buildNormalizableRawInput().nutrientMatrix,
        iron: rawNotDeclared(),
      },
    })

    const result = normalize(input)

    expect(result.enrichmentResult.nutrientMatrix.iron?.value).toBeNull()
    expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
    expect(result.status).not.toBe('normalized')
    expect(result.enrichmentResult.declarationEvaluation.status).toBe('insufficient_sources')
  })

  it('N-4: conflicting raw value stays unresolved and keeps conflict', () => {
    const conflict: FertilizerDeclarationConflict = {
      conflictId: 'conflict-iron',
      type: 'nutrient_value_conflict',
      fieldPath: 'nutrientMatrix.iron',
      sourceIds: ['prov-a', 'prov-b'],
      values: [
        { sourceId: 'prov-a', value: 1 },
        { sourceId: 'prov-b', value: 2 },
      ],
      blocking: true,
      resolvable: true,
      resolutionStatus: 'unresolved',
      reasonCode: 'matrix_mismatch',
    }

    const input = buildNormalizableRawInput({
      nutrientMatrix: {
        ...buildNormalizableRawInput().nutrientMatrix,
        iron: { status: 'conflicting', provenanceIds: ['prov-a', 'prov-b'] },
      },
      sourceConflicts: [conflict],
    })

    const result = normalize(input)

    expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
    expect(result.enrichmentResult.sourceConflicts).toEqual([conflict])
    expect(result.status).not.toBe('normalized')
  })

  it('N-5: NPK 0-0-30 is preserved exactly', () => {
    const input = buildNormalizableRawInput({
      npk: {
        nitrogen: rawDeclared(0, { declarationBasis: 'N' }),
        phosphate: rawDeclared(0, { declarationBasis: 'P2O5' }),
        potash: rawDeclared(30, { declarationBasis: 'K2O' }),
        declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
      },
    })

    const result = normalize(input)

    expect(result.enrichmentResult.npk).toMatchObject({
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
    })
  })

  it('N-6: null raw value does not auto-fill zero without DL-014 applicability', () => {
    const input = buildNormalizableRawInput({
      coverageMetadata: fullCoverage({ sourceEvaluationStatus: 'source_partial' }),
      nutrientMatrix: {
        ...buildNormalizableRawInput().nutrientMatrix,
        iron: null,
      },
    })

    const result = normalize(input)

    expect(result.enrichmentResult.nutrientMatrix.iron?.value).toBeNull()
    expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
  })

  it('N-7: basis_unknown stays unresolved without conversion', () => {
    const input = buildNormalizableRawInput({
      nutrientMatrix: {
        ...buildNormalizableRawInput().nutrientMatrix,
        iron: { status: 'basis_unknown' },
      },
    })

    const result = normalize(input)

    expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
    expect(result.status).not.toBe('normalized')
  })

  it('N-8: merchant vs manufacturer conflict remains when not deterministically resolved in raw input', () => {
    const conflict: FertilizerDeclarationConflict = {
      conflictId: 'conflict-npk',
      type: 'npk_conflict',
      fieldPath: 'npk.nitrogen',
      sourceIds: ['prov-manufacturer', 'prov-retailer'],
      values: [
        { sourceId: 'prov-manufacturer', value: 15 },
        { sourceId: 'prov-retailer', value: 16 },
      ],
      blocking: true,
      resolvable: true,
      resolutionStatus: 'unresolved',
      reasonCode: 'npk_mismatch',
    }

    const result = normalize(
      buildNormalizableRawInput({
        sourceConflicts: [conflict],
      }),
    )

    expect(result.enrichmentResult.sourceConflicts[0]).toEqual(conflict)
    expect(result.enrichmentResult.sourceConflicts[0].resolutionStatus).toBe('unresolved')
  })

  it('N-9: unconfirmed variant prevents fully_evaluated and dl014_zero', () => {
    const input = buildNormalizableRawInput({
      coverageMetadata: fullCoverage({ variantMatched: false }),
      nutrientMatrix: {
        ...buildNormalizableRawInput().nutrientMatrix,
        iron: rawNotDeclared(),
      },
    })

    const result = normalize(input)

    expect(result.enrichmentResult.declarationEvaluation.status).toBe('insufficient_sources')
    expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
    expect(result.enrichmentResult.nutrientMatrix.iron?.value).toBeNull()
    expect(result.status).not.toBe('normalized')
  })

  it('N-10: identical values from multiple sources do not create a new conflict', () => {
    const input = buildNormalizableRawInput({
      nutrientMatrix: {
        ...buildNormalizableRawInput().nutrientMatrix,
        iron: rawDeclared(1, {
          declarationBasis: 'Fe',
          provenanceIds: ['prov-decl', 'prov-decl-2'],
        }),
      },
      provenanceRecords: {
        ...buildNormalizableRawInput().provenanceRecords,
        'prov-decl-2': {
          provenanceId: 'prov-decl-2',
          fieldPath: 'nutrientMatrix.iron',
          sourceType: 'manufacturer_page',
          sourceCategory: 'official_manufacturer',
          sourceUrl: null,
          sourceTitle: null,
          evidence: 'Fe 1%',
          retrievedAt: '2026-07-29T10:00:00.000Z',
          confidence: 0.9,
        },
      },
    })

    const result = normalize(input)

    expect(result.enrichmentResult.sourceConflicts).toHaveLength(0)
    expect(result.enrichmentResult.nutrientMatrix.iron?.value).toBe(1)
  })

  it('N-11: blocking unresolvable conflict yields blocked status', () => {
    const conflict: FertilizerDeclarationConflict = {
      conflictId: 'conflict-blocked',
      type: 'identity_conflict',
      fieldPath: 'identity.officialName',
      sourceIds: ['prov-a'],
      values: [{ sourceId: 'prov-a', value: 'Product A' }],
      blocking: true,
      resolvable: false,
      resolutionStatus: 'not_resolvable',
      reasonCode: 'identity_not_actionable',
    }

    const result = normalize(
      buildNormalizableRawInput({
        sourceConflicts: [conflict],
      }),
    )

    expect(result.status).toBe('blocked')
    expect(result.enrichmentResult.sourceConflicts[0]).toEqual(conflict)
  })

  it('N-12: non-blocking conflict does not automatically prevent normalized when all requirements met', () => {
    const conflict: FertilizerDeclarationConflict = {
      conflictId: 'conflict-non-blocking',
      type: 'source_version_conflict',
      fieldPath: 'nutrientMatrix.iron',
      sourceIds: ['prov-decl'],
      values: [{ sourceId: 'prov-decl', value: 1 }],
      blocking: false,
      resolvable: true,
      resolutionStatus: 'unresolved',
      reasonCode: 'version_note',
    }

    const result = normalize(
      buildNormalizableRawInput({
        sourceConflicts: [conflict],
      }),
    )

    expect(result.status).toBe('normalized')
    expect(result.enrichmentResult.sourceConflicts[0]).toEqual(conflict)
  })

  it('N-13: does not perform readiness evaluation', () => {
    const result = normalize(buildNormalizableRawInput())

    expect(result).not.toHaveProperty('missingRequirements')
    expect(result).not.toHaveProperty('suggestedInputActions')
    expect(() => evaluateFertilizerReadiness).not.toThrow()
  })

  it('N-14: is a pure function without storage side effects', () => {
    const input = buildNormalizableRawInput()
    const first = normalize(input)
    const second = normalize(input)

    expect(first).toEqual(second)
    expect(first.normalizedAt).toBe(FIXED_NORMALIZED_AT)
    expect(first.normalizationRunId).toBe(FIXED_RUN_ID)
  })

  it('N-15: has no external analysis dependencies', async () => {
    const source = await import('./fertilizerDeclarationNormalizerCore?raw')

    expect(String(source.default)).not.toMatch(/fetch\(|ProductRecognize|openai|pdf|supabase/i)
  })

  it('throws unsupported_object_category for non-fertilizer input', () => {
    const input = buildNormalizableRawInput({ objectCategory: 'machine' })

    expect(() => normalize(input)).toThrow(FertilizerDeclarationNormalizationContractError)
    expect(() => normalize(input)).toThrow(/machine/)
  })

  it('derives fully_evaluated only from structured coverage metadata', () => {
    const complete = deriveDeclarationEvaluationStatus(fullCoverage())
    const partial = deriveDeclarationEvaluationStatus(
      fullCoverage({ nutrientSectionFullyCaptured: false }),
    )
    const notStarted = deriveDeclarationEvaluationStatus(
      fullCoverage({ sourceEvaluationStatus: 'not_started', evaluatedSourceIds: [] }),
    )

    expect(complete).toBe('fully_evaluated')
    expect(partial).toBe('insufficient_sources')
    expect(notStarted).toBe('not_started')
  })

  it('treats declared zero as valid', () => {
    const result = normalize(
      buildNormalizableRawInput({
        nutrientMatrix: {
          ...buildNormalizableRawInput().nutrientMatrix,
          iron: rawDeclared(0, { declarationBasis: 'Fe' }),
        },
      }),
    )

    expect(result.enrichmentResult.nutrientMatrix.iron?.value).toBe(0)
    expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('declared')
  })

  it('keeps NaN, Infinity, and negative declared values unresolved', () => {
    for (const invalidValue of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const result = normalize(
        buildNormalizableRawInput({
          nutrientMatrix: {
            ...buildNormalizableRawInput().nutrientMatrix,
            iron: rawDeclared(invalidValue, { declarationBasis: 'Fe' }),
          },
        }),
      )

      expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
      expect(result.status).not.toBe('normalized')
    }
  })

  it('handles not_extracted, unreadable, missing key, and empty evaluatedSourceIds', () => {
    const missingKeyInput = buildNormalizableRawInput()
    delete missingKeyInput.nutrientMatrix.iron

    const notExtractedResult = normalize(
      buildNormalizableRawInput({
        nutrientMatrix: {
          ...buildNormalizableRawInput().nutrientMatrix,
          iron: { status: 'not_extracted' },
        },
      }),
    )
    const unreadableResult = normalize(
      buildNormalizableRawInput({
        nutrientMatrix: {
          ...buildNormalizableRawInput().nutrientMatrix,
          iron: { status: 'unreadable' },
        },
      }),
    )
    const missingKeyResult = normalize(missingKeyInput)
    const emptySourcesResult = normalize(
      buildNormalizableRawInput({
        coverageMetadata: fullCoverage({ evaluatedSourceIds: [] }),
        nutrientMatrix: {
          ...buildNormalizableRawInput().nutrientMatrix,
          iron: rawNotDeclared(),
        },
      }),
    )

    expect(notExtractedResult.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
    expect(unreadableResult.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
    expect(missingKeyResult.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
    expect(emptySourcesResult.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
    expect(emptySourcesResult.enrichmentResult.nutrientMatrix.iron?.value).toBeNull()
  })

  it('keeps specification versions separated', () => {
    const result = normalize(buildNormalizableRawInput())

    expect(result.normalizationSpecificationVersion).toBe(
      FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
    )
    expect(result.enrichmentResult.specificationVersion).toBe(FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION)
    expect(result.enrichmentResult.specificationVersion).not.toBe(FERTILIZER_READINESS_SPECIFICATION_VERSION)
    expect(result.enrichmentResult.normalizationRulesVersion).toBe(
      FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
    )
  })

  it('stores conflicts and provenance canonically on enrichmentResult only', () => {
    const result = normalize(buildNormalizableRawInput())

    expect(result.enrichmentResult.sourceConflicts).toEqual([])
    expect(result.enrichmentResult.provenanceRecords['prov-decl']).toBeDefined()
    expect(result).not.toHaveProperty('conflicts')
    expect(result).not.toHaveProperty('provenance')
  })

  it('processes all 16 matrix keys explicitly', () => {
    const result = normalize(buildNormalizableRawInput())

    for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
      expect(result.enrichmentResult.nutrientMatrix[key]).toBeDefined()
      expect(result.enrichmentResult.nutrientMatrix[key]?.unit).toBe('%')
    }
  })

  it('does not apply dl014_zero when no provenance source is available', () => {
    const input = buildNormalizableRawInput({
      coverageMetadata: fullCoverage({ evaluatedSourceIds: ['missing-prov'] }),
      nutrientMatrix: {
        ...buildNormalizableRawInput().nutrientMatrix,
        iron: rawNotDeclared({ provenanceIds: [] }),
      },
    })

    const result = normalize(input)

    expect(result.enrichmentResult.nutrientMatrix.iron?.value).toBeNull()
    expect(result.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
  })

  it('uses injected normalizedAt and normalizationRunId', () => {
    const result = normalize(buildNormalizableRawInput(), {
      normalizedAt: '2026-01-02T00:00:00.000Z',
      normalizationRunId: 'custom-run',
    })

    expect(result.normalizedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(result.normalizationRunId).toBe('custom-run')
    expect(result.enrichmentResult.normalizationRunId).toBe('custom-run')
  })

  it('returns partially_normalized when no value is normalized and no blocker exists', () => {
    const unresolvedMatrix = Object.fromEntries(
      FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, { status: 'not_extracted' as const }]),
    ) as RawFertilizerDeclarationInput['nutrientMatrix']

    const result = normalize(
      buildNormalizableRawInput({
        coverageMetadata: fullCoverage({
          sourceEvaluationStatus: 'not_started',
          evaluatedSourceIds: [],
          productScopeConfirmed: false,
          variantMatched: false,
          nutrientSectionLocated: false,
          nutrientSectionFullyCaptured: false,
          declarationBasisResolved: false,
        }),
        npk: {
          nitrogen: { status: 'not_extracted' },
          phosphate: { status: 'not_extracted' },
          potash: { status: 'not_extracted' },
        },
        nutrientMatrix: unresolvedMatrix,
      }),
    )

    expect(result.status).toBe('partially_normalized')
    expect(result.status).not.toBe('blocked')
    expect(result.status).not.toBe('normalized')
  })

  it('returns partially_normalized for a fully empty but valid raw declaration shell', () => {
    const result = normalize({
      objectCategory: 'fertilizer',
      identity: {
        manufacturer: null,
        officialName: null,
        variant: null,
        identityFingerprint: null,
        identityConfidence: null,
        hasIdentityAmbiguity: false,
      },
      productForm: { value: null },
      npk: {},
      nutrientMatrix: {},
      coverageMetadata: {
        sourceEvaluationStatus: 'not_started',
        evaluatedSourceIds: [],
        productScopeConfirmed: false,
        variantMatched: false,
        nutrientSectionLocated: false,
        nutrientSectionFullyCaptured: false,
        declarationBasisResolved: false,
        hasBlockingDeclarationConflict: false,
      },
      provenanceRecords: {},
      sourceConflicts: [],
    })

    expect(result.status).toBe('partially_normalized')
    expect(result.enrichmentResult.declarationEvaluation.status).toBe('not_started')
  })

  it('returns blocked when no value is normalized but a blocking unresolvable conflict exists', () => {
    const unresolvedMatrix = Object.fromEntries(
      FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, { status: 'not_extracted' as const }]),
    ) as RawFertilizerDeclarationInput['nutrientMatrix']

    const result = normalize(
      buildNormalizableRawInput({
        coverageMetadata: fullCoverage({ sourceEvaluationStatus: 'not_started', evaluatedSourceIds: [] }),
        npk: {},
        nutrientMatrix: unresolvedMatrix,
        sourceConflicts: [
          {
            conflictId: 'conflict-blocked-empty',
            type: 'identity_conflict',
            fieldPath: 'identity.officialName',
            sourceIds: ['prov-a'],
            values: [{ sourceId: 'prov-a', value: 'Product A' }],
            blocking: true,
            resolvable: false,
            resolutionStatus: 'not_resolvable',
            reasonCode: 'identity_not_actionable',
          },
        ],
      }),
    )

    expect(result.status).toBe('blocked')
  })

  it('keeps normalized on the full happy path', () => {
    const result = normalize(buildNormalizableRawInput())

    expect(result.status).toBe('normalized')
    expect(result.enrichmentResult.declarationEvaluation.status).toBe('fully_evaluated')
  })
})
