import { createHash } from 'node:crypto'
import type {
  FertilizerCompositionFingerprintVersion,
  FertilizerProductVersionProjection,
} from '../types/fertilizerProductProfile'
import { FERTILIZER_COMPOSITION_FINGERPRINT_VERSION } from '../types/fertilizerProductProfile'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'

export class FertilizerCompositionFingerprintError extends Error {
  readonly code: 'unsupported_fingerprint_version' | 'invalid_projection'

  constructor(code: 'unsupported_fingerprint_version' | 'invalid_projection', message: string) {
    super(message)
    this.name = 'FertilizerCompositionFingerprintError'
    this.code = code
  }
}

export function assertSupportedCompositionFingerprintVersion(
  version: string,
): FertilizerCompositionFingerprintVersion {
  if (version !== FERTILIZER_COMPOSITION_FINGERPRINT_VERSION) {
    throw new FertilizerCompositionFingerprintError(
      'unsupported_fingerprint_version',
      'Composition fingerprint version is not supported.',
    )
  }

  return version
}

export function serializeFertilizerProductVersionProjection(
  projection: FertilizerProductVersionProjection,
): string {
  assertSupportedCompositionFingerprintVersion(projection.fingerprintVersion)

  const nutrientMatrixEntries = FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [
    key,
    projection.nutrientMatrix[key],
  ])

  const canonical = {
    fingerprintVersion: projection.fingerprintVersion,
    productForm: projection.productForm,
    npk: {
      nitrogen: projection.npk.nitrogen,
      phosphate: projection.npk.phosphate,
      potash: projection.npk.potash,
      declarationBasis: {
        nitrogen: projection.npk.declarationBasis.nitrogen,
        phosphate: projection.npk.declarationBasis.phosphate,
        potash: projection.npk.declarationBasis.potash,
      },
    },
    nutrientMatrix: Object.fromEntries(nutrientMatrixEntries),
  }

  return JSON.stringify(canonical)
}

export function computeFertilizerCompositionFingerprint(
  projection: FertilizerProductVersionProjection,
): { compositionFingerprintVersion: FertilizerCompositionFingerprintVersion; compositionFingerprint: string } {
  const canonical = serializeFertilizerProductVersionProjection(projection)
  const compositionFingerprint = createHash('sha256').update(canonical, 'utf8').digest('hex')

  return {
    compositionFingerprintVersion: projection.fingerprintVersion,
    compositionFingerprint,
  }
}

export function projectionsHaveSameComposition(
  left: FertilizerProductVersionProjection,
  right: FertilizerProductVersionProjection,
): boolean {
  return (
    computeFertilizerCompositionFingerprint(left).compositionFingerprint ===
    computeFertilizerCompositionFingerprint(right).compositionFingerprint
  )
}
