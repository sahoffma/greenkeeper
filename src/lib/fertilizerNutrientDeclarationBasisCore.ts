import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'
import type { FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'

export function defaultNutrientDeclarationBasisForMatrixKey(
  key: FertilizerNutrientMatrixKey,
): string {
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
      return 'S'
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

function looksLikeFormattedPercentBasis(basis: string, value: number | null | undefined): boolean {
  const normalized = basis.trim().toLowerCase()
  if (!normalized.includes('%')) {
    return false
  }

  if (value == null) {
    return true
  }

  const valueTokenDot = String(value).replace(/\.?0+$/, '')
  const valueTokenComma = valueTokenDot.replace('.', ',')
  return (
    normalized.startsWith(valueTokenDot) ||
    normalized.startsWith(valueTokenComma) ||
    normalized === `${value} %`.toLowerCase() ||
    normalized === `${valueTokenComma} %`
  )
}

export function sanitizeNutrientDeclarationBasis(input: {
  key: FertilizerNutrientMatrixKey
  declarationBasis: string | null | undefined
  value?: number | null
}): string {
  const explicit = input.declarationBasis?.trim()
  if (
    explicit &&
    !looksLikeFormattedPercentBasis(explicit, input.value ?? null) &&
    !/^\d+([.,]\d+)?$/.test(explicit)
  ) {
    return explicit
  }

  return defaultNutrientDeclarationBasisForMatrixKey(input.key)
}

export function isValidStoredNutrientDeclarationBasis(
  key: FertilizerNutrientMatrixKey,
  basis: string | null | undefined,
  value?: number | null,
): boolean {
  const sanitized = sanitizeNutrientDeclarationBasis({
    key,
    declarationBasis: basis,
    value,
  })
  return sanitized === basis?.trim()
}

export const FERTILIZER_NUTRIENT_MATRIX_KEY_SET = new Set<string>(FERTILIZER_NUTRIENT_MATRIX_KEYS)
