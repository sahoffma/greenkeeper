import { describe, expect, it } from 'vitest'
import { isValidNutrientNumericValue } from './fertilizerNutrientValueCore'

describe('isValidNutrientNumericValue', () => {
  it('accepts zero and positive finite numbers', () => {
    expect(isValidNutrientNumericValue(0)).toBe(true)
    expect(isValidNutrientNumericValue(15)).toBe(true)
    expect(isValidNutrientNumericValue(0.5)).toBe(true)
  })

  it('rejects null, undefined, and non-numeric values', () => {
    expect(isValidNutrientNumericValue(null)).toBe(false)
    expect(isValidNutrientNumericValue(undefined)).toBe(false)
    expect(isValidNutrientNumericValue('10' as unknown as number)).toBe(false)
  })

  it('rejects NaN and non-finite numbers', () => {
    expect(isValidNutrientNumericValue(Number.NaN)).toBe(false)
    expect(isValidNutrientNumericValue(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isValidNutrientNumericValue(Number.NEGATIVE_INFINITY)).toBe(false)
  })

  it('rejects negative numbers', () => {
    expect(isValidNutrientNumericValue(-1)).toBe(false)
  })
})
