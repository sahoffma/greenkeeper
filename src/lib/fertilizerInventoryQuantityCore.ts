import { FertilizerInventoryError } from '../types/fertilizerInventoryCore'

export const FERTILIZER_INVENTORY_MAX_QUANTITY = 100_000
export const FERTILIZER_INVENTORY_MAX_DECIMAL_PLACES = 4
export const FERTILIZER_INVENTORY_QUANTITY_SCALE = 10_000

function countDecimalPlaces(value: number): number {
  if (!Number.isFinite(value)) {
    return Number.MAX_SAFE_INTEGER
  }

  const normalized = value.toString().toLowerCase()
  if (normalized.includes('e')) {
    const [coefficient, exponentPart] = normalized.split('e')
    const exponent = Number.parseInt(exponentPart, 10)
    const coefficientDecimals = coefficient.includes('.') ? coefficient.split('.')[1]?.length ?? 0 : 0

    if (exponent >= 0) {
      return Math.max(0, coefficientDecimals - exponent)
    }

    return coefficientDecimals - exponent
  }

  const fraction = normalized.split('.')[1]
  return fraction?.length ?? 0
}

export function assertInventoryQuantityPrecision(
  value: number,
  fieldName = 'quantity',
): void {
  if (!Number.isFinite(value)) {
    throw new FertilizerInventoryError(
      'invalid_quantity',
      `${fieldName} must be a finite number.`,
    )
  }

  if (Math.abs(value) > FERTILIZER_INVENTORY_MAX_QUANTITY) {
    throw new FertilizerInventoryError(
      'invalid_quantity',
      `${fieldName} exceeds the supported inventory magnitude.`,
    )
  }

  if (countDecimalPlaces(value) > FERTILIZER_INVENTORY_MAX_DECIMAL_PLACES) {
    throw new FertilizerInventoryError(
      'invalid_quantity',
      `${fieldName} supports at most ${FERTILIZER_INVENTORY_MAX_DECIMAL_PLACES} decimal places.`,
    )
  }
}

/** Normalizes a quantity to DL-021 scale without additional rounding assumptions. */
export function normalizeInventoryQuantity(value: number, fieldName = 'quantity'): number {
  assertInventoryQuantityPrecision(value, fieldName)
  return Math.round(value * FERTILIZER_INVENTORY_QUANTITY_SCALE) / FERTILIZER_INVENTORY_QUANTITY_SCALE
}

export function scaleInventoryQuantity(value: number, fieldName = 'quantity'): number {
  return Math.round(normalizeInventoryQuantity(value, fieldName) * FERTILIZER_INVENTORY_QUANTITY_SCALE)
}

export function unscaleInventoryQuantity(scaledValue: number): number {
  return scaledValue / FERTILIZER_INVENTORY_QUANTITY_SCALE
}
