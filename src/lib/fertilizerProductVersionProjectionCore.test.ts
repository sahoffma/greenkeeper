import { describe, expect, it } from 'vitest'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'
import type { FertilizerReadinessReadyResult } from '../types/fertilizerEnrichmentOrchestration'
import { FERTILIZER_COMPOSITION_FINGERPRINT_VERSION } from '../types/fertilizerProductProfile'
import type { RawFertilizerDeclarationInput } from '../types/fertilizerDeclarationNormalization'
import {
  FertilizerProductVersionProjectionError,
  buildFertilizerProductFamilyKey,
  canonicalizeFertilizerVersionDecimal,
  canonicalizeFertilizerVersionDecimalString,
  expandExponentialFertilizerVersionDecimalString,
  projectFertilizerProductVersionFromPipeline,
} from './fertilizerProductVersionProjectionCore'
import {
  buildPhase5PipelineReadyResult,
  buildPhase5RawInput,
  rawDeclared,
  rawNotDeclared,
  defaultBasisForKey,
} from './fertilizerProductProfileSaveTestFixtures'

describe('fertilizerProductVersionProjectionCore', () => {
  it('VP-1: identical fachlicher input yields identical projection', () => {
    const left = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())
    const right = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())

    expect(left).toEqual(right)
    expect(left.fingerprintVersion).toBe(FERTILIZER_COMPOSITION_FINGERPRINT_VERSION)
  })

  it('VP-3: decimal normalization treats 30, 30.0 and 30.00 equally', () => {
    expect(canonicalizeFertilizerVersionDecimal(30)).toBe('30')
    expect(canonicalizeFertilizerVersionDecimal(30.0)).toBe('30')
    expect(canonicalizeFertilizerVersionDecimal(30.0)).toBe(canonicalizeFertilizerVersionDecimal(30.00))
    expect(canonicalizeFertilizerVersionDecimalString('030.000')).toBe('30')
  })

  it('VP-4: negative zero canonicalizes to zero', () => {
    expect(canonicalizeFertilizerVersionDecimal(-0)).toBe('0')
    expect(canonicalizeFertilizerVersionDecimal(0)).toBe('0')
  })

  it('VP-5: incomplete declaration cannot be projected for save', () => {
    const pipeline = buildPhase5PipelineReadyResult()
    pipeline.readinessResult = {
      ...pipeline.readinessResult,
      status: 'needs_input',
      missingRequirements: ['ingredients.matrix'],
    } as FertilizerReadinessReadyResult

    expect(() => projectFertilizerProductVersionFromPipeline(pipeline)).toThrow(
      FertilizerProductVersionProjectionError,
    )
  })

  it('VP-6: provenance metadata changes do not affect projection', () => {
    const base = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())
    const otherSource = projectFertilizerProductVersionFromPipeline(
      buildPhase5PipelineReadyResult({
        provenanceRecords: {
          'prov-other': {
            provenanceId: 'prov-other',
            fieldPath: 'nutrientMatrix.nitrogen',
            sourceType: 'user_document',
            sourceCategory: 'user_provided',
            sourceUrl: 'https://other.example/doc.pdf',
            sourceTitle: 'Other',
            evidence: 'N 15%',
            retrievedAt: '2026-07-29T10:00:00.000Z',
            confidence: 0.5,
          },
        },
      }),
    )

    expect(base).toEqual(otherSource)
  })

  it('VP-7/VP-8/VP-9: pack size, packaging and marketing metadata are not part of projection', () => {
    const projection = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())
    const serialized = JSON.stringify(projection)

    expect(serialized.includes('pack')).toBe(false)
    expect(serialized.includes('kg')).toBe(false)
    expect(serialized.includes('photo')).toBe(false)
    expect(serialized.includes('marketing')).toBe(false)
  })

  it('buildFertilizerProductFamilyKey uses identity fields without composition', () => {
    const familyA = buildFertilizerProductFamilyKey({
      manufacturer: 'ICL',
      productLine: 'Professional',
      officialName: 'Spring Start',
      variant: 'Standard',
    })
    const familyB = buildFertilizerProductFamilyKey({
      manufacturer: 'ICL',
      productLine: 'Professional',
      officialName: 'Spring Start',
      variant: 'Standard',
    })

    expect(familyA).toBe(familyB)
    expect(familyA).not.toContain('15')
  })

  it('DL-014: fully evaluated missing nutrient becomes zero in projection', () => {
    const nutrientMatrix = Object.fromEntries(
      FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [
        key,
        rawNotDeclared({ declarationBasis: defaultBasisForKey(key) }),
      ]),
    ) as RawFertilizerDeclarationInput['nutrientMatrix']

    const projection = projectFertilizerProductVersionFromPipeline(
      buildPhase5PipelineReadyResult({ nutrientMatrix }),
    )

    expect(projection.nutrientMatrix.iron).toBe('0')
  })

  it('declared zero differs from unresolved incomplete matrix', () => {
    const declaredZero = projectFertilizerProductVersionFromPipeline(
      buildPhase5PipelineReadyResult({
        nutrientMatrix: {
          ...buildPhase5RawInput().nutrientMatrix,
          iron: rawDeclared(0, { declarationBasis: 'Fe' }),
        },
      }),
    )

    expect(declaredZero.nutrientMatrix.iron).toBe('0')

    const incompletePipeline = buildPhase5PipelineReadyResult()
    incompletePipeline.normalizationResult.enrichmentResult.nutrientMatrix.iron = {
      value: null,
      unit: '%',
      declarationBasis: 'Fe',
      normalization: 'unresolved',
      provenanceId: null,
      evidence: null,
      sourceUrl: null,
      sourceCategory: null,
      confidence: null,
      conflictStatus: null,
    }

    expect(() => projectFertilizerProductVersionFromPipeline(incompletePipeline)).toThrow(
      FertilizerProductVersionProjectionError,
    )
  })
})

describe('canonicalizeFertilizerVersionDecimalString', () => {
  it('DC-1: equivalent decimal spellings canonicalize to the same value', () => {
    for (const value of ['30', '30.0', '30.00', '030.000']) {
      expect(canonicalizeFertilizerVersionDecimalString(value)).toBe('30')
    }
  })

  it('DC-2: negative zero canonicalizes to zero', () => {
    expect(canonicalizeFertilizerVersionDecimalString('-0')).toBe('0')
    expect(canonicalizeFertilizerVersionDecimalString('-0.0')).toBe('0')
    expect(canonicalizeFertilizerVersionDecimalString('0')).toBe('0')
  })

  it('DC-3: close distinct values remain distinct', () => {
    expect(canonicalizeFertilizerVersionDecimalString('1.0000004')).toBe('1.0000004')
    expect(canonicalizeFertilizerVersionDecimalString('1.0000005')).toBe('1.0000005')
    expect(canonicalizeFertilizerVersionDecimalString('1.0000004')).not.toBe(
      canonicalizeFertilizerVersionDecimalString('1.0000005'),
    )
  })

  it('DC-4: values beyond six fractional digits are not truncated', () => {
    expect(canonicalizeFertilizerVersionDecimalString('0.1234567')).toBe('0.1234567')
    expect(canonicalizeFertilizerVersionDecimalString('0.1234568')).toBe('0.1234568')
    expect(canonicalizeFertilizerVersionDecimalString('0.1234567')).not.toBe(
      canonicalizeFertilizerVersionDecimalString('0.1234568'),
    )
  })

  it('DC-5: very small values remain distinct and non-zero', () => {
    expect(canonicalizeFertilizerVersionDecimalString('0.0000001')).toBe('0.0000001')
    expect(canonicalizeFertilizerVersionDecimalString('0.0000002')).toBe('0.0000002')
    expect(canonicalizeFertilizerVersionDecimalString('0.0000001')).not.toBe('0')
  })

  it('DC-6: exponential notation expands to plain decimal strings', () => {
    expect(canonicalizeFertilizerVersionDecimalString('1e-7')).toBe('0.0000001')
    expect(canonicalizeFertilizerVersionDecimalString('2e-7')).toBe('0.0000002')
    expect(canonicalizeFertilizerVersionDecimalString('1e-7')).not.toBe(
      canonicalizeFertilizerVersionDecimalString('2e-7'),
    )
  })

  it('DC-7: large exponential values expand without rounding', () => {
    expect(canonicalizeFertilizerVersionDecimalString('1.23e5')).toBe('123000')
    expect(expandExponentialFertilizerVersionDecimalString('1.23e5')).toBe('123000')
  })

  it('DC-8: trailing fractional zeros are removed', () => {
    expect(canonicalizeFertilizerVersionDecimalString('0.5000')).toBe('0.5')
    expect(canonicalizeFertilizerVersionDecimalString('0001.0000004')).toBe('1.0000004')
  })

  it('DC-9: invalid values are rejected', () => {
    for (const value of ['NaN', 'Infinity', '-Infinity', '', ' 1', '1,5', 'abc']) {
      expect(() => canonicalizeFertilizerVersionDecimalString(value)).toThrow(
        FertilizerProductVersionProjectionError,
      )
    }

    expect(() => canonicalizeFertilizerVersionDecimal(Number.NaN)).toThrow(
      FertilizerProductVersionProjectionError,
    )
    expect(() => canonicalizeFertilizerVersionDecimal(Number.POSITIVE_INFINITY)).toThrow(
      FertilizerProductVersionProjectionError,
    )
  })

  it('DC-10: canonicalization is locale-independent', () => {
    expect(canonicalizeFertilizerVersionDecimal(30.0)).toBe('30')
    expect(canonicalizeFertilizerVersionDecimalString('30.0')).toBe('30')
    expect(canonicalizeFertilizerVersionDecimalString('30.0')).not.toContain(',')
  })
})

describe('canonicalizeFertilizerVersionDecimal from number', () => {
  it('preserves distinguishable IEEE-754 values without six-decimal rounding', () => {
    expect(canonicalizeFertilizerVersionDecimal(1.0000004)).toBe('1.0000004')
    expect(canonicalizeFertilizerVersionDecimal(1.0000005)).toBe('1.0000005')
    expect(canonicalizeFertilizerVersionDecimal(0.1234567)).toBe('0.1234567')
    expect(canonicalizeFertilizerVersionDecimal(0.1234568)).toBe('0.1234568')
  })

  it('expands number exponential notation deterministically', () => {
    expect(canonicalizeFertilizerVersionDecimal(1e-7)).toBe('0.0000001')
    expect(canonicalizeFertilizerVersionDecimal(2e-7)).toBe('0.0000002')
    expect(canonicalizeFertilizerVersionDecimal(1.23e5)).toBe('123000')
  })
})
