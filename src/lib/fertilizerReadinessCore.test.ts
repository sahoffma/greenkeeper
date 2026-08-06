import { describe, expect, it } from 'vitest'
import {
  evaluateFertilizerReadiness,
  FertilizerReadinessContractError,
  isNutrientMatrixComplete,
} from './fertilizerReadinessCore'
import { isValidNutrientNumericValue } from './fertilizerNutrientValueCore'
import {
  FERTILIZER_READINESS_SPECIFICATION_VERSION,
  type FertilizerNutrientMatrix,
  type FertilizerNutrientValue,
  type FertilizerProductProfileReadinessInput,
} from '../types/fertilizerReadiness'

const STABLE_EVALUATED_AT = '2026-07-29T12:00:00.000Z'

function nutrientValue(
  value: number,
  declarationBasis = 'N',
): FertilizerNutrientValue {
  return { value, unit: '%', declarationBasis }
}

function fullNutrientMatrix(
  overrides: Partial<FertilizerNutrientMatrix> = {},
): FertilizerNutrientMatrix {
  return {
    nitrogen: nutrientValue(15, 'N'),
    phosphate: nutrientValue(0, 'P2O5'),
    potash: nutrientValue(26, 'K2O'),
    nitrateNitrogen: nutrientValue(5, 'N'),
    ammoniumNitrogen: nutrientValue(5, 'N'),
    ureaNitrogen: nutrientValue(5, 'N'),
    organicNitrogen: nutrientValue(0, 'N'),
    magnesium: nutrientValue(2, 'MgO'),
    calcium: nutrientValue(0, 'CaO'),
    sulfur: nutrientValue(0, 'SO3'),
    iron: nutrientValue(0, 'Fe'),
    manganese: nutrientValue(0, 'Mn'),
    copper: nutrientValue(0, 'Cu'),
    zinc: nutrientValue(0, 'Zn'),
    boron: nutrientValue(0, 'B'),
    molybdenum: nutrientValue(0, 'Mo'),
    ...overrides,
  }
}

function buildReadyFertilizerInput(
  overrides: Partial<FertilizerProductProfileReadinessInput> = {},
): FertilizerProductProfileReadinessInput {
  return {
    objectCategory: 'fertilizer',
    identity: {
      manufacturer: 'ICL',
      officialName: 'Spring Start',
      variant: '15-0-26',
      identityFingerprint: 'icl-spring-start-15-0-26',
      identityConfidence: 0.95,
      identityAmbiguity: { isAmbiguous: false, candidateCount: 1 },
    },
    productForm: 'granular',
    npk: {
      nitrogen: 15,
      phosphate: 0,
      potash: 26,
      declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
    },
    nutrientMatrix: fullNutrientMatrix(),
    declarationEvaluation: { status: 'fully_evaluated' },
    blockingSourceConflict: null,
    ...overrides,
  }
}

function evaluate(input: FertilizerProductProfileReadinessInput) {
  return evaluateFertilizerReadiness(input, { evaluatedAt: STABLE_EVALUATED_AT })
}

describe('evaluateFertilizerReadiness', () => {
  describe('AC-1 complete fertilizer', () => {
    it('returns ready for a fully intake-capable profile', () => {
      const result = evaluate(buildReadyFertilizerInput())

      expect(result.status).toBe('ready')
      expect(result.missingRequirements).toEqual([])
      expect(result.blockingIssues).toEqual([])
      expect(result.suggestedInputActions).toEqual([])
      expect(result.evaluatedAt).toBe(STABLE_EVALUATED_AT)
      expect(result.specificationVersion).toBe(FERTILIZER_READINESS_SPECIFICATION_VERSION)
    })
  })

  describe('AC-2 missing product form', () => {
    it('returns needs_input with basis.product_form and confirm_product_form', () => {
      const result = evaluate(buildReadyFertilizerInput({ productForm: null }))

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toContain('basis.product_form')
      expect(result.suggestedInputActions).toContain('confirm_product_form')
      expect(result.status).not.toBe('ready')
    })
  })

  describe('AC-3 NPK 0-0-30', () => {
    it('accepts zero NPK values when all other requirements are met', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          npk: {
            nitrogen: 0,
            phosphate: 0,
            potash: 30,
            declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
          },
          nutrientMatrix: fullNutrientMatrix({
            nitrogen: nutrientValue(0, 'N'),
            phosphate: nutrientValue(0, 'P2O5'),
            potash: nutrientValue(30, 'K2O'),
          }),
        }),
      )

      expect(result.status).toBe('ready')
    })
  })

  describe('AC-4 ambiguous variant', () => {
    it('returns needs_input with identity.ambiguity and confirm_product_variant', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          identity: {
            ...buildReadyFertilizerInput().identity,
            identityAmbiguity: {
              isAmbiguous: true,
              candidateCount: 2,
              conflictReason: 'variant_collision',
            },
          },
        }),
      )

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toContain('identity.ambiguity')
      expect(result.suggestedInputActions).toContain('confirm_product_variant')
    })
  })

  describe('AC-5 iron normalized to 0 after full declaration', () => {
    it('treats explicit iron 0 as valid and does not block readiness', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          nutrientMatrix: fullNutrientMatrix({
            iron: nutrientValue(0, 'Fe'),
          }),
        }),
      )

      expect(result.status).toBe('ready')
      expect(result.missingRequirements).not.toContain('ingredients.matrix')
    })
  })

  describe('AC-6 declaration not fully evaluated', () => {
    it('does not infer missing nutrients as 0 and requests declaration source', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          declarationEvaluation: { status: 'insufficient_sources' },
          nutrientMatrix: fullNutrientMatrix({ iron: null }),
        }),
      )

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toContain('ingredients.declaration_source')
      expect(result.missingRequirements).not.toContain('ingredients.matrix')
      expect(result.suggestedInputActions).toEqual(
        expect.arrayContaining(['provide_product_document']),
      )
    })
  })

  describe('AC-7 blocking source conflict', () => {
    it('returns needs_input when conflict is resolvable', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          blockingSourceConflict: { blocking: true, resolvable: true },
        }),
      )

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toContain('sources.conflict')
      expect(result.blockingIssues).toEqual([])
    })

    it('returns not_ready with blocking issue when conflict is not resolvable', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          blockingSourceConflict: { blocking: true, resolvable: false },
        }),
      )

      expect(result.status).toBe('not_ready')
      expect(result.missingRequirements).toContain('sources.conflict')
      expect(result.blockingIssues).toEqual([{ code: 'sources.conflict' }])
    })
  })

  describe('AC-8 missing application info only', () => {
    it('remains ready when blocking requirements are fulfilled', () => {
      const result = evaluate(buildReadyFertilizerInput())

      expect(result.status).toBe('ready')
    })
  })

  describe('AC-9 product form unknown', () => {
    it('returns needs_input and not ready', () => {
      const result = evaluate(buildReadyFertilizerInput({ productForm: 'unknown' }))

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toContain('basis.product_form')
      expect(result.status).not.toBe('ready')
    })
  })

  describe('AC-10 identity not unique', () => {
    it('returns needs_input when ambiguity is resolvable', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          identity: {
            ...buildReadyFertilizerInput().identity,
            identityAmbiguity: { isAmbiguous: true, candidateCount: 2 },
            identityAmbiguityResolvable: true,
          },
        }),
      )

      expect(result.status).toBe('needs_input')
    })

    it('returns not_ready when identity is explicitly not actionable', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          identity: {
            ...buildReadyFertilizerInput().identity,
            identityNotActionable: true,
          },
        }),
      )

      expect(result.status).toBe('not_ready')
      expect(result.blockingIssues).toEqual([{ code: 'identity.not_actionable' }])
    })

    it('returns not_ready when ambiguity is explicitly not resolvable', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          identity: {
            ...buildReadyFertilizerInput().identity,
            identityAmbiguity: { isAmbiguous: true, candidateCount: 3 },
            identityAmbiguityResolvable: false,
          },
        }),
      )

      expect(result.status).toBe('not_ready')
      expect(result.missingRequirements).toContain('identity.ambiguity')
    })
  })

  describe('AC-11 wrong object category', () => {
    it('throws unsupported_object_category without a readiness result', () => {
      expect(() =>
        evaluate(
          buildReadyFertilizerInput({
            objectCategory: 'tool',
          }),
        ),
      ).toThrow(FertilizerReadinessContractError)

      try {
        evaluate(buildReadyFertilizerInput({ objectCategory: 'machine' }))
      } catch (error) {
        expect(error).toBeInstanceOf(FertilizerReadinessContractError)
        expect((error as FertilizerReadinessContractError).code).toBe(
          'unsupported_object_category',
        )
        expect((error as FertilizerReadinessContractError).receivedObjectCategory).toBe('machine')
      }
    })
  })

  describe('edge cases', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['negative', -1],
    ] as const)('rejects invalid NPK value %s', (_label, value) => {
      const result = evaluate(
        buildReadyFertilizerInput({
          npk: {
            nitrogen: value as number | null,
            phosphate: 0,
            potash: 26,
            declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
          },
        }),
      )

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toContain('basis.npk')
    })

    it('accepts matrix nutrient value 0', () => {
      expect(isValidNutrientNumericValue(0)).toBe(true)
      expect(
        isNutrientMatrixComplete(
          fullNutrientMatrix({
            boron: nutrientValue(0, 'B'),
          }),
        ),
      ).toBe(true)
    })

    it('rejects missing matrix value after fully evaluated declaration', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          nutrientMatrix: fullNutrientMatrix({ zinc: undefined }),
        }),
      )

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toContain('ingredients.matrix')
    })

    it('rejects invalid matrix value', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          nutrientMatrix: fullNutrientMatrix({
            zinc: { value: Number.NaN, unit: '%', declarationBasis: 'Zn' },
          }),
        }),
      )

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toContain('ingredients.matrix')
    })

    it('requires NPK declaration basis', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          npk: {
            nitrogen: 15,
            phosphate: 0,
            potash: 26,
            declarationBasis: null,
          },
        }),
      )

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toContain('basis.npk.declaration_basis')
    })

    it('treats empty manufacturer and official name as missing identity', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          identity: {
            ...buildReadyFertilizerInput().identity,
            manufacturer: '   ',
            officialName: '',
          },
        }),
      )

      expect(result.status).toBe('needs_input')
      expect(result.missingRequirements).toEqual(
        expect.arrayContaining(['identity.manufacturer', 'identity.official_name']),
      )
    })

    it('deduplicates and sorts missing requirements and suggested actions', () => {
      const result = evaluate(
        buildReadyFertilizerInput({
          productForm: null,
          npk: {
            nitrogen: null,
            phosphate: null,
            potash: null,
            declarationBasis: null,
          },
          declarationEvaluation: { status: 'not_started' },
        }),
      )

      const missing = result.missingRequirements
      const actions = result.suggestedInputActions

      expect(missing).toEqual([...missing].sort())
      expect(actions).toEqual([...actions].sort())
      expect(new Set(missing).size).toBe(missing.length)
      expect(new Set(actions).size).toBe(actions.length)
    })
  })
})

describe('isValidNutrientNumericValue', () => {
  it('distinguishes 0 from null and missing values', () => {
    expect(isValidNutrientNumericValue(0)).toBe(true)
    expect(isValidNutrientNumericValue(null)).toBe(false)
    expect(isValidNutrientNumericValue(undefined)).toBe(false)
  })
})
