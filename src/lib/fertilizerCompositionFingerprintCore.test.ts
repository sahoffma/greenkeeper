import { describe, expect, it } from 'vitest'
import { FERTILIZER_COMPOSITION_FINGERPRINT_VERSION } from '../types/fertilizerProductProfile'
import {
  FertilizerCompositionFingerprintError,
  assertSupportedCompositionFingerprintVersion,
  computeFertilizerCompositionFingerprint,
  projectionsHaveSameComposition,
  serializeFertilizerProductVersionProjection,
} from './fertilizerCompositionFingerprintCore'
import { projectFertilizerProductVersionFromPipeline } from './fertilizerProductVersionProjectionCore'
import {
  buildPhase5PipelineReadyResult,
  buildPhase5RawInput,
  rawDeclared,
  rawNotDeclared,
  withNpk,
  defaultBasisForKey,
} from './fertilizerProductProfileSaveTestFixtures'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'

describe('fertilizerCompositionFingerprintCore', () => {
  it('VP-1: identical projection yields identical fingerprint', () => {
    const projection = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())
    const first = computeFertilizerCompositionFingerprint(projection)
    const second = computeFertilizerCompositionFingerprint(projection)

    expect(first).toEqual(second)
    expect(first.compositionFingerprintVersion).toBe(FERTILIZER_COMPOSITION_FINGERPRINT_VERSION)
    expect(first.compositionFingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('VP-2: property order in raw input does not change fingerprint', () => {
    const projection = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())
    const reordered = {
      nutrientMatrix: { ...projection.nutrientMatrix },
      npk: { ...projection.npk },
      productForm: projection.productForm,
      fingerprintVersion: projection.fingerprintVersion,
    }

    const canonical = serializeFertilizerProductVersionProjection({
      ...projection,
      ...reordered,
    })

    expect(canonical).toBe(serializeFertilizerProductVersionProjection(projection))
  })

  it('VP-3/VP-4: decimal and negative-zero normalization yields same fingerprint', () => {
    const base = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())
    const adjusted = projectFertilizerProductVersionFromPipeline(
      buildPhase5PipelineReadyResult(withNpk(15.0, 0.0, 26.0)),
    )

    expect(computeFertilizerCompositionFingerprint(base).compositionFingerprint).toBe(
      computeFertilizerCompositionFingerprint(adjusted).compositionFingerprint,
    )
  })

  it('VC-2: NPK change yields different fingerprint', () => {
    const v30 = projectFertilizerProductVersionFromPipeline(
      buildPhase5PipelineReadyResult(withNpk(0, 0, 30)),
    )
    const v29 = projectFertilizerProductVersionFromPipeline(
      buildPhase5PipelineReadyResult(withNpk(0, 0, 29)),
    )

    expect(
      computeFertilizerCompositionFingerprint(v30).compositionFingerprint,
    ).not.toBe(computeFertilizerCompositionFingerprint(v29).compositionFingerprint)
  })

  it('VC-3: secondary nutrient change yields different fingerprint', () => {
    const left = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())
    const right = projectFertilizerProductVersionFromPipeline(
      buildPhase5PipelineReadyResult({
        nutrientMatrix: {
          ...buildPhase5RawInput().nutrientMatrix,
          magnesium: rawDeclared(3, { declarationBasis: 'MgO' }),
        },
      }),
    )

    expect(projectionsHaveSameComposition(left, right)).toBe(false)
  })

  it('VC-6: relevant product form change yields different fingerprint', () => {
    const granular = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())
    const liquid = projectFertilizerProductVersionFromPipeline(
      buildPhase5PipelineReadyResult({
        productForm: { value: 'liquid' },
      }),
    )

    expect(computeFertilizerCompositionFingerprint(granular).compositionFingerprint).not.toBe(
      computeFertilizerCompositionFingerprint(liquid).compositionFingerprint,
    )
  })

  it('rejects unsupported fingerprint version', () => {
    expect(() => assertSupportedCompositionFingerprintVersion('unknown-v99')).toThrow(
      FertilizerCompositionFingerprintError,
    )
  })

  it('FP-1: equivalent decimal notation yields the same fingerprint', () => {
    const base = computeFertilizerCompositionFingerprint(
      projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult(withNpk(30, 0, 0))),
    )
    const equivalent = computeFertilizerCompositionFingerprint(
      projectFertilizerProductVersionFromPipeline(
        buildPhase5PipelineReadyResult(withNpk(30.0, 0.0, 0.0)),
      ),
    )

    expect(equivalent.compositionFingerprint).toBe(base.compositionFingerprint)
  })

  it('FP-2: differences beyond six fractional digits yield different fingerprints', () => {
    const left = computeFertilizerCompositionFingerprint(
      projectFertilizerProductVersionFromPipeline(
        buildPhase5PipelineReadyResult(withNpk(0, 0, 1.0000004)),
      ),
    )
    const right = computeFertilizerCompositionFingerprint(
      projectFertilizerProductVersionFromPipeline(
        buildPhase5PipelineReadyResult(withNpk(0, 0, 1.0000005)),
      ),
    )

    expect(left.compositionFingerprint).not.toBe(right.compositionFingerprint)
  })

  it('FP-3: pack size remains outside the fingerprint', () => {
    const fingerprint = computeFertilizerCompositionFingerprint(
      projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult()),
    ).compositionFingerprint

    const serialized = JSON.stringify(
      projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult()),
    )
    expect(serialized.includes('pack')).toBe(false)
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('FP-4: property order remains irrelevant to fingerprint equality', () => {
    const projection = projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult())
    const reordered = serializeFertilizerProductVersionProjection({
      ...projection,
      nutrientMatrix: { ...projection.nutrientMatrix },
      npk: { ...projection.npk },
    })

    expect(reordered).toBe(serializeFertilizerProductVersionProjection(projection))
  })

  it('FP-5: DL-014 zero remains canonical zero in fingerprint projection', () => {
    const projection = projectFertilizerProductVersionFromPipeline(
      buildPhase5PipelineReadyResult({
        nutrientMatrix: Object.fromEntries(
          FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [
            key,
            rawNotDeclared({ declarationBasis: defaultBasisForKey(key), provenanceIds: ['prov-decl'] }),
          ]),
        ) as ReturnType<typeof buildPhase5RawInput>['nutrientMatrix'],
      }),
    )

    expect(projection.nutrientMatrix.iron).toBe('0')
    expect(projection.nutrientMatrix.iron).toBe(
      projectFertilizerProductVersionFromPipeline(
        buildPhase5PipelineReadyResult({
          nutrientMatrix: {
            ...buildPhase5RawInput().nutrientMatrix,
            iron: rawDeclared(0, { declarationBasis: 'Fe' }),
          },
        }),
      ).nutrientMatrix.iron,
    )
  })
})
