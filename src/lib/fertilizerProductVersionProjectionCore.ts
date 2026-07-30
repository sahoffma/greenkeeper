import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { NormalizedFertilizerEnrichmentResult } from '../types/fertilizerDeclarationNormalization'
import type { FertilizerEnrichmentPipelineReadyResult } from '../types/fertilizerEnrichmentOrchestration'
import type {
  FertilizerCompositionFingerprintVersion,
  FertilizerProductVersionProjection,
  FertilizerProductVersionProjectionNpk,
} from '../types/fertilizerProductProfile'
import { FERTILIZER_COMPOSITION_FINGERPRINT_VERSION } from '../types/fertilizerProductProfile'
import type { ProductProfileForm } from '../types/productProfile'
import {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  type FertilizerNutrientMatrixKey,
} from '../types/fertilizerReadiness'
import { normalizeFingerprintPart } from './fertilizerInventoryCore'

export class FertilizerProductVersionProjectionError extends Error {
  readonly code:
    | 'not_save_ready'
    | 'unsupported_object_category'
    | 'invalid_declaration'
    | 'incomplete_projection'

  constructor(
    code:
      | 'not_save_ready'
      | 'unsupported_object_category'
      | 'invalid_declaration'
      | 'incomplete_projection',
    message: string,
  ) {
    super(message)
    this.name = 'FertilizerProductVersionProjectionError'
    this.code = code
  }
}

export function buildFertilizerProductFamilyKey(
  identity: Pick<
    FertilizerEnrichmentIdentity,
    'manufacturer' | 'productLine' | 'officialName' | 'variant'
  >,
): string | null {
  const parts = [
    normalizeFingerprintPart(identity.manufacturer),
    normalizeFingerprintPart(identity.productLine),
    normalizeFingerprintPart(identity.officialName),
    normalizeFingerprintPart(identity.variant),
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('|') : null
}

const FERTILIZER_VERSION_DECIMAL_STRING_PATTERN =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

function throwInvalidFertilizerVersionDecimal(message: string): never {
  throw new FertilizerProductVersionProjectionError('invalid_declaration', message)
}

export function expandExponentialFertilizerVersionDecimalString(value: string): string {
  let sign = ''
  let working = value

  if (working.startsWith('+')) {
    working = working.slice(1)
  }
  if (working.startsWith('-')) {
    sign = '-'
    working = working.slice(1)
  }

  const match = /^(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/.exec(working)
  if (!match) {
    throwInvalidFertilizerVersionDecimal('Version projection decimal string is invalid.')
  }

  const coefficient = match[1]
  const exponent = Number(match[2])
  const [intPart, fracPart = ''] = coefficient.split('.')
  const digits = intPart + fracPart

  if (exponent >= 0) {
    const trailingZeros = exponent - fracPart.length
    if (trailingZeros >= 0) {
      return `${sign}${digits}${'0'.repeat(trailingZeros)}`
    }

    const splitAt = intPart.length + exponent
    return `${sign}${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`
  }

  const decimalPosition = intPart.length + exponent
  if (decimalPosition <= 0) {
    return `${sign}0.${'0'.repeat(-decimalPosition)}${digits}`
  }

  return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`
}

function numberToFullDecimalString(value: number): string {
  const str = value.toString()
  if (!/[eE]/.test(str)) {
    return str
  }

  return expandExponentialFertilizerVersionDecimalString(str)
}

function canonicalizeUnsignedDecimalParts(intPart: string, fracPart: string): string {
  const canonicalInt = intPart.replace(/^0+(?=\d)/, '') || '0'
  const canonicalFrac = fracPart.replace(/0+$/, '')

  if (canonicalInt === '0' && canonicalFrac.length === 0) {
    return '0'
  }

  return canonicalFrac.length > 0 ? `${canonicalInt}.${canonicalFrac}` : canonicalInt
}

export function canonicalizeFertilizerVersionDecimalString(raw: string): string {
  if (raw.length === 0) {
    throwInvalidFertilizerVersionDecimal('Version projection decimal string must not be empty.')
  }

  if (/\s/.test(raw)) {
    throwInvalidFertilizerVersionDecimal('Version projection decimal string must not contain whitespace.')
  }

  if (raw.includes(',')) {
    throwInvalidFertilizerVersionDecimal('Version projection decimal string must not use comma separators.')
  }

  let normalized = raw
  if (normalized.startsWith('+')) {
    normalized = normalized.slice(1)
  }

  if (
    normalized === 'NaN' ||
    normalized === 'Infinity' ||
    normalized === '-Infinity' ||
    normalized === '+Infinity'
  ) {
    throwInvalidFertilizerVersionDecimal('Version projection decimal string must be finite.')
  }

  if (!FERTILIZER_VERSION_DECIMAL_STRING_PATTERN.test(normalized)) {
    throwInvalidFertilizerVersionDecimal('Version projection decimal string is invalid.')
  }

  if (/[eE]/.test(normalized)) {
    normalized = expandExponentialFertilizerVersionDecimalString(normalized)
  }

  if (!Number.isFinite(Number(normalized))) {
    throwInvalidFertilizerVersionDecimal('Version projection decimal string must be finite.')
  }

  let negative = false
  if (normalized.startsWith('-')) {
    negative = true
    normalized = normalized.slice(1)
  }

  const dotIndex = normalized.indexOf('.')
  const intPart = dotIndex === -1 ? normalized : normalized.slice(0, dotIndex)
  const fracPart = dotIndex === -1 ? '' : normalized.slice(dotIndex + 1)

  const unsigned = canonicalizeUnsignedDecimalParts(intPart, fracPart)
  if (unsigned === '0') {
    return '0'
  }

  return negative ? `-${unsigned}` : unsigned
}

export function canonicalizeFertilizerVersionDecimal(value: number): string {
  if (Object.is(value, -0)) {
    return '0'
  }

  if (!Number.isFinite(value)) {
    throwInvalidFertilizerVersionDecimal('Version projection contains a non-finite numeric value.')
  }

  return canonicalizeFertilizerVersionDecimalString(numberToFullDecimalString(value))
}

function requireProductForm(value: string | null | undefined): ProductProfileForm {
  if (value === 'granular' || value === 'liquid') {
    return value
  }

  throw new FertilizerProductVersionProjectionError(
    'incomplete_projection',
    'Version projection requires a known product form.',
  )
}

function projectNpk(
  enrichment: NormalizedFertilizerEnrichmentResult,
): FertilizerProductVersionProjectionNpk {
  const { nitrogen, phosphate, potash, declarationBasis } = enrichment.npk

  if (
    nitrogen == null ||
    phosphate == null ||
    potash == null ||
    declarationBasis == null
  ) {
    throw new FertilizerProductVersionProjectionError(
      'incomplete_projection',
      'Version projection requires a complete NPK declaration.',
    )
  }

  return {
    nitrogen: canonicalizeFertilizerVersionDecimal(nitrogen),
    phosphate: canonicalizeFertilizerVersionDecimal(phosphate),
    potash: canonicalizeFertilizerVersionDecimal(potash),
    declarationBasis,
  }
}

function projectNutrientMatrix(
  enrichment: NormalizedFertilizerEnrichmentResult,
): Record<FertilizerNutrientMatrixKey, string> {
  const projected = {} as Record<FertilizerNutrientMatrixKey, string>

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const entry = enrichment.nutrientMatrix[key]
    if (entry == null) {
      throw new FertilizerProductVersionProjectionError(
        'incomplete_projection',
        `Version projection requires nutrient matrix entry for ${key}.`,
      )
    }

    if (entry.normalization !== 'declared' && entry.normalization !== 'dl014_zero') {
      throw new FertilizerProductVersionProjectionError(
        'incomplete_projection',
        `Version projection requires resolved nutrient value for ${key}.`,
      )
    }

    if (entry.value == null) {
      throw new FertilizerProductVersionProjectionError(
        'incomplete_projection',
        `Version projection requires numeric nutrient value for ${key}.`,
      )
    }

    projected[key] = canonicalizeFertilizerVersionDecimal(entry.value)
  }

  return projected
}

export function assertPipelineReadyForProductVersionSave(
  pipelineResult: FertilizerEnrichmentPipelineReadyResult,
): void {
  if (pipelineResult.readinessInput.objectCategory !== 'fertilizer') {
    throw new FertilizerProductVersionProjectionError(
      'unsupported_object_category',
      'Product version save supports fertilizer only.',
    )
  }

  if (pipelineResult.normalizationResult.status !== 'normalized') {
    throw new FertilizerProductVersionProjectionError(
      'not_save_ready',
      'Product version save requires normalized enrichment.',
    )
  }

  if (pipelineResult.readinessResult.status !== 'ready') {
    throw new FertilizerProductVersionProjectionError(
      'not_save_ready',
      'Product version save requires intake-ready readiness.',
    )
  }

  if (pipelineResult.readinessInput.declarationEvaluation.status !== 'fully_evaluated') {
    throw new FertilizerProductVersionProjectionError(
      'not_save_ready',
      'Product version save requires a fully evaluated declaration.',
    )
  }
}

export function projectFertilizerProductVersionFromPipeline(
  pipelineResult: FertilizerEnrichmentPipelineReadyResult,
  fingerprintVersion: FertilizerCompositionFingerprintVersion = FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
): FertilizerProductVersionProjection {
  assertPipelineReadyForProductVersionSave(pipelineResult)

  const enrichment = pipelineResult.normalizationResult.enrichmentResult

  return {
    fingerprintVersion,
    productForm: requireProductForm(enrichment.productForm.value),
    npk: projectNpk(enrichment),
    nutrientMatrix: projectNutrientMatrix(enrichment),
  }
}

export function buildFertilizerNpkDeclarationLabel(
  projection: Pick<FertilizerProductVersionProjection, 'npk'>,
): string {
  return `${projection.npk.nitrogen}-${projection.npk.phosphate}-${projection.npk.potash}`
}
