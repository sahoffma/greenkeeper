/** Shared numeric nutrient validation — no readiness, normalization, or persistence dependencies. */

/** Valid nutrient value: finite number >= 0. Zero is valid; null/undefined/NaN are not. */
export function isValidNutrientNumericValue(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
