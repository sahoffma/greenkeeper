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
import { FertilizerDeclarationNormalizationContractError } from './fertilizerDeclarationNormalizerCore'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'

const FIXED_NORMALIZED_AT = '2026-07-29T12:00:00.000Z'
const FIXED_RUN_ID = 'pipeline-run-test'
const FIXED_EVALUATED_AT = '2026-07-29T13:00:00.000Z'

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

function buildPipelineReadyRawInput(
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
      identityFingerprint: 'icl-spring-start-15-0-26',
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

function runPipeline(
  input: RawFertilizerDeclarationInput,
  overrides: {
    normalizedAt?: string
    normalizationRunId?: string
    evaluatedAt?: string
  } = {},
) {
  return evaluateRawFertilizerDeclaration(input, {
    normalizedAt: FIXED_NORMALIZED_AT,
    normalizationRunId: FIXED_RUN_ID,
    evaluatedAt: FIXED_EVALUATED_AT,
    ...overrides,
  })
}

describe('evaluateRawFertilizerDeclaration', () => {
  it('P-1: fully declared fertilizer yields normalized and ready with separated versions', () => {
    const result = runPipeline(buildPipelineReadyRawInput())

    expect(result.normalizationResult.status).toBe('normalized')
    expect(result.readinessResult.status).toBe('ready')
    expect(result.normalizationResult.normalizationSpecificationVersion).toBe(
      FERTILIZER_DECLARATION_NORMALIZATION_SPECIFICATION_VERSION,
    )
    expect(result.normalizationResult.enrichmentResult.specificationVersion).toBe(
      FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION,
    )
    expect(result.readinessResult.specificationVersion).toBe(FERTILIZER_READINESS_SPECIFICATION_VERSION)
  })

  it('P-2: DL-014 zero values pass through builder to readiness as valid', () => {
    const nutrientMatrix = Object.fromEntries(
      FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [
        key,
        rawNotDeclared({ declarationBasis: defaultBasisForKey(key) }),
      ]),
    ) as RawFertilizerDeclarationInput['nutrientMatrix']

    const result = runPipeline(
      buildPipelineReadyRawInput({
        nutrientMatrix,
      }),
    )

    expect(result.normalizationResult.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('dl014_zero')
    expect(result.readinessInput.nutrientMatrix.iron?.value).toBe(0)
    expect(result.readinessResult.status).toBe('ready')
  })

  it('P-3: incomplete declaration yields partially_normalized and needs_input', () => {
    const incompleteMatrix = Object.fromEntries(
      FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, { status: 'not_extracted' as const }]),
    ) as RawFertilizerDeclarationInput['nutrientMatrix']

    const result = runPipeline(
      buildPipelineReadyRawInput({
        coverageMetadata: fullCoverage({ sourceEvaluationStatus: 'source_partial' }),
        npk: {
          nitrogen: { status: 'not_extracted' },
          phosphate: { status: 'not_extracted' },
          potash: { status: 'not_extracted' },
          declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
        },
        nutrientMatrix: incompleteMatrix,
      }),
    )

    expect(result.normalizationResult.status).toBe('partially_normalized')
    expect(result.normalizationResult.enrichmentResult.nutrientMatrix.iron?.normalization).toBe('unresolved')
    expect(result.readinessResult.status).toBe('needs_input')
    expect(result.readinessResult.missingRequirements).toContain('ingredients.declaration_source')
    expect(result.readinessResult.missingRequirements).toContain('basis.npk')
  })

  it('P-4: normalized nutrients with unknown product form still need input', () => {
    const result = runPipeline(
      buildPipelineReadyRawInput({
        productForm: { value: 'unknown' },
      }),
    )

    expect(result.normalizationResult.status).toBe('normalized')
    expect(result.readinessResult.status).toBe('needs_input')
    expect(result.readinessResult.missingRequirements).toContain('basis.product_form')
    expect(result.readinessResult.suggestedInputActions).toContain('confirm_product_form')
  })

  it('P-5: resolvable identity ambiguity yields needs_input with confirm_product_variant', () => {
    const result = runPipeline(
      buildPipelineReadyRawInput({
        identity: {
          ...buildPipelineReadyRawInput().identity,
          hasIdentityAmbiguity: true,
          identityAmbiguityResolvable: true,
        },
      }),
    )

    expect(result.readinessResult.status).toBe('needs_input')
    expect(result.readinessResult.suggestedInputActions).toContain('confirm_product_variant')
  })

  it('P-6: identity not actionable yields blocked normalization and not_ready readiness', () => {
    const result = runPipeline(
      buildPipelineReadyRawInput({
        identity: {
          ...buildPipelineReadyRawInput().identity,
          identityNotActionable: true,
        },
      }),
    )

    expect(result.normalizationResult.status).toBe('blocked')
    expect(result.readinessResult.status).toBe('not_ready')
    expect(result.readinessResult.blockingIssues).toEqual([{ code: 'identity.not_actionable' }])
  })

  it('P-7: blocking resolvable conflict yields needs_input with resolvable aggregation', () => {
    const conflict: FertilizerDeclarationConflict = {
      conflictId: 'conflict-resolvable',
      type: 'npk_conflict',
      fieldPath: 'npk.nitrogen',
      sourceIds: ['prov-a', 'prov-b'],
      values: [
        { sourceId: 'prov-a', value: 15 },
        { sourceId: 'prov-b', value: 16 },
      ],
      blocking: true,
      resolvable: true,
      resolutionStatus: 'unresolved',
      reasonCode: 'npk_mismatch',
    }

    const result = runPipeline(
      buildPipelineReadyRawInput({
        sourceConflicts: [conflict],
      }),
    )

    expect(result.normalizationResult.enrichmentResult.sourceConflicts[0]).toEqual(conflict)
    expect(result.readinessInput.blockingSourceConflict).toEqual({ blocking: true, resolvable: true })
    expect(result.readinessResult.status).toBe('needs_input')
  })

  it('P-8: blocking unresolvable conflict yields blocked and not_ready', () => {
    const conflict: FertilizerDeclarationConflict = {
      conflictId: 'conflict-unresolvable',
      type: 'identity_conflict',
      fieldPath: 'identity.officialName',
      sourceIds: ['prov-a'],
      values: [{ sourceId: 'prov-a', value: 'Product A' }],
      blocking: true,
      resolvable: false,
      resolutionStatus: 'not_resolvable',
      reasonCode: 'identity_not_actionable',
    }

    const result = runPipeline(
      buildPipelineReadyRawInput({
        sourceConflicts: [conflict],
      }),
    )

    expect(result.normalizationResult.status).toBe('blocked')
    expect(result.readinessInput.blockingSourceConflict).toEqual({ blocking: true, resolvable: false })
    expect(result.readinessResult.status).toBe('not_ready')
  })

  it('P-9: non-blocking conflict does not automatically prevent ready', () => {
    const conflict: FertilizerDeclarationConflict = {
      conflictId: 'conflict-non-blocking',
      type: 'source_version_conflict',
      fieldPath: 'nutrientMatrix.iron',
      sourceIds: ['prov-decl'],
      values: [{ sourceId: 'prov-decl', value: 0 }],
      blocking: false,
      resolvable: true,
      resolutionStatus: 'unresolved',
      reasonCode: 'version_note',
    }

    const result = runPipeline(
      buildPipelineReadyRawInput({
        sourceConflicts: [conflict],
      }),
    )

    expect(result.normalizationResult.enrichmentResult.sourceConflicts[0]).toEqual(conflict)
    expect(result.readinessResult.status).toBe('ready')
  })

  it('P-10: NPK 0-0-30 is preserved through the full chain', () => {
    const nutrientMatrix = Object.fromEntries(
      FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => {
        const basis = defaultBasisForKey(key)
        const value = key === 'potash' ? 30 : 0
        return [key, rawDeclared(value, { declarationBasis: basis })]
      }),
    ) as RawFertilizerDeclarationInput['nutrientMatrix']

    const result = runPipeline(
      buildPipelineReadyRawInput({
        npk: {
          nitrogen: rawDeclared(0, { declarationBasis: 'N' }),
          phosphate: rawDeclared(0, { declarationBasis: 'P2O5' }),
          potash: rawDeclared(30, { declarationBasis: 'K2O' }),
          declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
        },
        nutrientMatrix,
      }),
    )

    expect(result.normalizationResult.enrichmentResult.npk).toMatchObject({
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
    })
    expect(result.readinessInput.npk).toMatchObject({
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
    })
    expect(result.readinessResult.status).toBe('ready')
  })

  it('P-11: missing NPK declaration basis prevents normalized and ready', () => {
    const result = runPipeline(
      buildPipelineReadyRawInput({
        npk: {
          nitrogen: rawDeclared(15, { declarationBasis: 'N' }),
          phosphate: rawDeclared(0, { declarationBasis: 'P2O5' }),
          potash: rawDeclared(26, { declarationBasis: 'K2O' }),
        },
      }),
    )

    expect(result.normalizationResult.status).not.toBe('normalized')
    expect(result.readinessResult.status).not.toBe('ready')
    expect(result.readinessResult.missingRequirements).toContain('basis.npk.declaration_basis')
  })

  it('P-12: wrong object category throws before builder and evaluator run', () => {
    expect(() =>
      runPipeline(buildPipelineReadyRawInput({ objectCategory: 'machine' })),
    ).toThrow(FertilizerDeclarationNormalizationContractError)
  })

  it('P-13: fully empty raw shell yields partially_normalized and needs_input', () => {
    const result = runPipeline({
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

    expect(result.normalizationResult.status).toBe('partially_normalized')
    expect(result.readinessResult.status).toBe('needs_input')
  })

  it('P-14: uses injected normalizedAt, normalizationRunId, and evaluatedAt', () => {
    const result = runPipeline(buildPipelineReadyRawInput(), {
      normalizedAt: '2026-01-02T00:00:00.000Z',
      normalizationRunId: 'custom-run',
      evaluatedAt: '2026-01-03T00:00:00.000Z',
    })

    expect(result.normalizationResult.normalizedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(result.normalizationResult.normalizationRunId).toBe('custom-run')
    expect(result.readinessResult.evaluatedAt).toBe('2026-01-03T00:00:00.000Z')
  })

  it('P-15: does not mutate the input object', () => {
    const input = buildPipelineReadyRawInput()
    const snapshot = structuredClone(input)

    runPipeline(input)

    expect(input).toEqual(snapshot)
  })
})
